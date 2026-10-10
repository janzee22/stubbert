using System.Text.Json;
using Jellyfin.Data.Enums;
using Jellyfin.Plugin.Stubbert.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Plugins;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Stubbert;

/// <summary>
/// Gives a replaced movie or episode file the date its title was first added, so upgrades stay out of "Recently added".
/// </summary>
public sealed class AddedDatesService : IHostedService, IDisposable
{
    private static readonly TimeSpan SaveDelay = TimeSpan.FromSeconds(5);

    private readonly ILibraryManager _libraryManager;
    private readonly ILogger<AddedDatesService> _logger;
    private readonly object _lock = new();
    private readonly Timer _saveTimer;
    private AddedDates _dates = new();
    private bool _wasEnabled;

    public AddedDatesService(ILibraryManager libraryManager, ILogger<AddedDatesService> logger)
    {
        _libraryManager = libraryManager;
        _logger = logger;
        _saveTimer = new Timer(_ => Save());
    }

    private static PluginConfiguration? Config => Plugin.Instance?.Configuration;

    private static bool Enabled => Config?.KeepAddedDates == true;

    private static TimeSpan ForgetAfter => TimeSpan.FromDays(Math.Max(1, Config?.ForgetAddedDatesAfterDays ?? 30));

    private static string? StorePath
        => Plugin.Instance is { } plugin ? Path.Combine(plugin.DataFolderPath, "added-dates.json") : null;

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _dates = Load();
        _libraryManager.ItemAdded += OnItemAdded;
        _libraryManager.ItemUpdated += OnItemUpdated;
        _libraryManager.ItemRemoved += OnItemRemoved;
        if (Plugin.Instance is { } plugin)
        {
            plugin.ConfigurationChanged += OnConfigurationChanged;
        }

        _wasEnabled = Enabled;
        if (_wasEnabled)
        {
            _ = Task.Run(ReconcileAsync, CancellationToken.None);
        }

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        Unsubscribe();
        Save();
        return Task.CompletedTask;
    }

    public void Dispose()
    {
        Unsubscribe();
        _saveTimer.Dispose();
    }

    private void Unsubscribe()
    {
        _libraryManager.ItemAdded -= OnItemAdded;
        _libraryManager.ItemUpdated -= OnItemUpdated;
        _libraryManager.ItemRemoved -= OnItemRemoved;
        if (Plugin.Instance is { } plugin)
        {
            plugin.ConfigurationChanged -= OnConfigurationChanged;
        }
    }

    private void OnConfigurationChanged(object? sender, BasePluginConfiguration e)
    {
        var enabled = Enabled;
        if (enabled && !_wasEnabled)
        {
            _ = Task.Run(ReconcileAsync, CancellationToken.None);
        }

        _wasEnabled = enabled;
    }

    private void OnItemAdded(object? sender, ItemChangeEventArgs e)
    {
        // Episode numbers are only read from the file name during the metadata refresh, which runs after ItemAdded.
        if (Enabled && e.Item is Episode { IndexNumber: null } episode && Tracked(episode))
        {
            _libraryManager.FillMissingEpisodeNumbersFromPath(episode, false);
        }

        Track(e.Item);
    }

    // Also catches a file replaced under the same name: the refresh then resets DateCreated without an ItemAdded.
    private void OnItemUpdated(object? sender, ItemChangeEventArgs e) => Track(e.Item);

    private void OnItemRemoved(object? sender, ItemChangeEventArgs e)
    {
        if (!Enabled || !Tracked(e.Item) || KeyOf(e.Item) is not { } key)
        {
            return;
        }

        lock (_lock)
        {
            _dates.Removed(key, e.Item.Id, DateTime.UtcNow);
        }

        ScheduleSave();
    }

    private void Track(BaseItem item)
    {
        if (!Enabled || !Tracked(item) || KeyOf(item) is not { } key)
        {
            return;
        }

        DateTime? date;
        lock (_lock)
        {
            date = _dates.Seen(key, item.Id, item.DateCreated, DateTime.UtcNow, ForgetAfter);
        }

        ScheduleSave();
        if (date is { } first)
        {
            _ = RestoreAsync(item, first);
        }
    }

    private async Task RestoreAsync(BaseItem item, DateTime first)
    {
        _logger.LogInformation("[Stubbert] {Name} was replaced; keeping its date added {Date:u}", item.Name, first);
        item.DateCreated = first;
        try
        {
            await item.UpdateToRepositoryAsync(ItemUpdateType.MetadataEdit, CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Stubbert] Could not save the date added of {Name}", item.Name);
        }
    }

    private async Task ReconcileAsync()
    {
        try
        {
            var library = _libraryManager
                .GetItemList(new InternalItemsQuery
                {
                    IncludeItemTypes = [BaseItemKind.Movie, BaseItemKind.Episode],
                    IsVirtualItem = false,
                    Recursive = true,
                })
                .Where(Tracked)
                .Select(i => (Item: i, Key: KeyOf(i)))
                .Where(x => x.Key is not null)
                .ToList();
            IReadOnlyList<(Guid ItemId, DateTime Date)> changes;
            lock (_lock)
            {
                changes = _dates.Reconcile(
                    library.Select(x => (x.Key!, x.Item.Id, x.Item.DateCreated)), DateTime.UtcNow, ForgetAfter);
            }

            Save();
            var byId = library.ToDictionary(x => x.Item.Id, x => x.Item);
            foreach (var (id, date) in changes)
            {
                await RestoreAsync(byId[id], date).ConfigureAwait(false);
            }

            _logger.LogInformation(
                "[Stubbert] Tracking the date added of {Count} titles; restored {Changed}", _dates.Entries.Count, changes.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Stubbert] Could not read the library to track dates added");
        }
    }

    // Alternate versions count: while old and new file sit side by side Jellyfin groups them as versions, resets the
    // dates of both, and later promotes the survivor.
    private static bool Tracked(BaseItem item)
        => item is Movie or Episode && !item.IsVirtualItem && item.ExtraType is null;

    private static string? KeyOf(BaseItem item) => item switch
    {
        Movie movie => AddedDates.MovieKey(
            movie.ContainingFolderPath,
            movie.IsInMixedFolder,
            movie.GetProviderId(MetadataProvider.Tmdb),
            movie.GetProviderId(MetadataProvider.Imdb)),
        Episode episode => AddedDates.EpisodeKey(episode.SeriesId, episode.ParentIndexNumber, episode.IndexNumber),
        _ => null,
    };

    // A library scan can add thousands of items; write once it settles.
    private void ScheduleSave() => _saveTimer.Change(SaveDelay, Timeout.InfiniteTimeSpan);

    private AddedDates Load()
    {
        try
        {
            if (StorePath is { } path && File.Exists(path))
            {
                var entries = JsonSerializer.Deserialize<Dictionary<string, AddedDates.Entry>>(File.ReadAllText(path));
                return new AddedDates(entries is null ? null : new Dictionary<string, AddedDates.Entry>(entries, StringComparer.Ordinal));
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Stubbert] Could not read {Path}; starting over", StorePath);
        }

        return new AddedDates();
    }

    private void Save()
    {
        if (StorePath is not { } path)
        {
            return;
        }

        try
        {
            string json;
            lock (_lock)
            {
                json = JsonSerializer.Serialize(_dates.Entries);
            }

            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var temp = path + ".tmp";
            File.WriteAllText(temp, json);
            File.Move(temp, path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Stubbert] Could not save {Path}", path);
        }
    }
}

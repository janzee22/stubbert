using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Stubbert;

public sealed class CategoryScope : IDisposable
{
    private readonly ILibraryManager _libraryManager;
    private readonly ILogger<CategoryScope> _logger;
    private readonly object _lock = new();
    private (Guid LibraryId, IReadOnlyList<BoxSet> Items, CategorySet Set)? _cache;

    public CategoryScope(ILibraryManager libraryManager, ILogger<CategoryScope> logger)
    {
        _libraryManager = libraryManager;
        _logger = logger;
        _libraryManager.ItemAdded += OnItemChanged;
        _libraryManager.ItemUpdated += OnItemChanged;
        _libraryManager.ItemRemoved += OnItemChanged;
    }

    public static Guid? ConfiguredLibraryId =>
        Guid.TryParse(Plugin.Instance?.Configuration.CategoriesLibraryId, out var id) && id != Guid.Empty ? id : null;

    public CollectionFolder? GetLibrary()
        => ConfiguredLibraryId is { } id ? _libraryManager.GetItemById(id) as CollectionFolder : null;

    public IReadOnlyList<string> GetLocations()
    {
        if (ConfiguredLibraryId is not { } id)
        {
            return [];
        }

        var folder = _libraryManager.GetVirtualFolders()
            .FirstOrDefault(v => Guid.TryParse(v.ItemId, out var itemId) && itemId == id);
        return folder?.Locations ?? [];
    }

    public IReadOnlyList<BoxSet> GetCategoryItems() => Load().Items;

    public CategorySet GetCategories() => Load().Set;

    public void Invalidate()
    {
        lock (_lock)
        {
            _cache = null;
        }
    }

    public void Dispose()
    {
        _libraryManager.ItemAdded -= OnItemChanged;
        _libraryManager.ItemUpdated -= OnItemChanged;
        _libraryManager.ItemRemoved -= OnItemChanged;
    }

    private (IReadOnlyList<BoxSet> Items, CategorySet Set) Load()
    {
        var libraryId = ConfiguredLibraryId;
        if (libraryId is null)
        {
            return ([], CategorySet.Empty);
        }

        lock (_lock)
        {
            if (_cache is { } c && c.LibraryId == libraryId.Value)
            {
                return (c.Items, c.Set);
            }
        }

        var locations = GetLocations();
        if (locations.Count == 0)
        {
            _logger.LogWarning("[Stubbert] Configured library {LibraryId} not found or has no folders", libraryId);
            return ([], CategorySet.Empty);
        }

        var roots = locations
            .Select(p => Path.TrimEndingDirectorySeparator(p) + Path.DirectorySeparatorChar)
            .ToArray();
        var items = _libraryManager
            .GetItemList(new InternalItemsQuery { IncludeItemTypes = [BaseItemKind.BoxSet], Recursive = true })
            .OfType<BoxSet>()
            .Where(b => !string.IsNullOrEmpty(b.Path) && roots.Any(r => b.Path.StartsWith(r, StringComparison.Ordinal)))
            .ToList();
        var set = CategorySet.Build(items.Select(b => (b.Id, b.GetLinkedChildren().Select(m => m.Id))));

        lock (_lock)
        {
            _cache = (libraryId.Value, items, set);
        }

        return (items, set);
    }

    private void OnItemChanged(object? sender, ItemChangeEventArgs e)
    {
        if (e.Item is BoxSet)
        {
            Invalidate();
        }
    }
}

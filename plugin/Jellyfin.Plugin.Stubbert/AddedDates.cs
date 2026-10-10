namespace Jellyfin.Plugin.Stubbert;

/// <summary>
/// Remembers when each movie folder or episode first appeared, so a replaced file keeps the date it was first added.
/// </summary>
public sealed class AddedDates
{
    private readonly Dictionary<string, Entry> _entries;

    public AddedDates(Dictionary<string, Entry>? entries = null)
    {
        _entries = entries ?? new Dictionary<string, Entry>(StringComparer.Ordinal);
    }

    public IReadOnlyDictionary<string, Entry> Entries => _entries;

    /// <summary>
    /// The movie's folder, which Radarr keeps when it swaps the file. Movies sharing one folder fall back to their ids,
    /// which only exist after the metadata refresh.
    /// </summary>
    public static string? MovieKey(string? folder, bool mixedFolder, string? tmdb, string? imdb)
    {
        if (!mixedFolder && !string.IsNullOrEmpty(folder))
        {
            return $"movie:{folder}";
        }

        if (!string.IsNullOrEmpty(tmdb))
        {
            return $"movie:tmdb:{tmdb}";
        }

        return string.IsNullOrEmpty(imdb) ? null : $"movie:imdb:{imdb}";
    }

    public static string? EpisodeKey(Guid seriesId, int? season, int? episode)
        => seriesId == Guid.Empty || season is null || episode is null ? null : $"episode:{seriesId:N}:{season}:{episode}";

    /// <summary>
    /// Records an item that exists now. Returns the date it should get instead of <paramref name="created"/>, or null
    /// when its own date is already the earliest.
    /// </summary>
    public DateTime? Seen(string key, Guid itemId, DateTime created, DateTime now, TimeSpan forgetAfter)
    {
        if (!_entries.TryGetValue(key, out var entry) || entry.IsForgotten(now, forgetAfter))
        {
            _entries[key] = new Entry { First = created, Items = [itemId] };
            return null;
        }

        entry.Items.Add(itemId);
        entry.GoneSince = null;
        if (created <= entry.First)
        {
            entry.First = created;
            return null;
        }

        return entry.First;
    }

    public void Removed(string key, Guid itemId, DateTime now)
    {
        if (_entries.TryGetValue(key, out var entry) && entry.Items.Remove(itemId) && entry.Items.Count == 0)
        {
            entry.GoneSince = now;
        }
    }

    /// <summary>
    /// Replaces the known items with the library as it is now. Returns the items whose date should change.
    /// </summary>
    public IReadOnlyList<(Guid ItemId, DateTime Date)> Reconcile(
        IEnumerable<(string Key, Guid ItemId, DateTime Created)> library, DateTime now, TimeSpan forgetAfter)
    {
        foreach (var entry in _entries.Values)
        {
            entry.Items.Clear();
        }

        var changes = new List<(Guid, DateTime)>();
        foreach (var (key, itemId, created) in library)
        {
            if (Seen(key, itemId, created, now, forgetAfter) is { } date)
            {
                changes.Add((itemId, date));
            }
        }

        foreach (var entry in _entries.Values.Where(e => e.Items.Count == 0))
        {
            entry.GoneSince ??= now;
        }

        Prune(now, forgetAfter);
        return changes;
    }

    public int Prune(DateTime now, TimeSpan forgetAfter)
    {
        var forgotten = _entries.Where(e => e.Value.IsForgotten(now, forgetAfter)).Select(e => e.Key).ToList();
        foreach (var key in forgotten)
        {
            _entries.Remove(key);
        }

        return forgotten.Count;
    }

    public sealed class Entry
    {
        public DateTime First { get; set; }

        public HashSet<Guid> Items { get; set; } = [];

        public DateTime? GoneSince { get; set; }

        public bool IsForgotten(DateTime now, TimeSpan forgetAfter)
            => Items.Count == 0 && GoneSince is { } gone && now - gone > forgetAfter;
    }
}

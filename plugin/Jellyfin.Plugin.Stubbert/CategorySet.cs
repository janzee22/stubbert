namespace Jellyfin.Plugin.Stubbert;

public sealed class CategorySet
{
    private CategorySet(IReadOnlySet<Guid> all, IReadOnlySet<Guid> children)
    {
        All = all;
        Children = children;
    }

    public static CategorySet Empty { get; } = new(new HashSet<Guid>(), new HashSet<Guid>());

    public IReadOnlySet<Guid> All { get; }

    public IReadOnlySet<Guid> Children { get; }

    public static CategorySet Build(IEnumerable<(Guid Id, IEnumerable<Guid> MemberIds)> categories)
    {
        var list = categories.ToList();
        var all = list.Select(c => c.Id).ToHashSet();
        var children = list
            .SelectMany(c => c.MemberIds.Where(m => m != c.Id))
            .Where(all.Contains)
            .ToHashSet();
        return new CategorySet(all, children);
    }
}

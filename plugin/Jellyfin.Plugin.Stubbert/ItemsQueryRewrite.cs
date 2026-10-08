using Jellyfin.Data.Enums;

namespace Jellyfin.Plugin.Stubbert;

public enum ParentKind
{
    None,

    CategoriesLibrary,

    BoxSet,

    Other,
}

public sealed record ItemsQueryArgs(ParentKind Parent, IReadOnlyList<BaseItemKind> IncludeItemTypes, IReadOnlyList<Guid> ExcludeItemIds);

public static class ItemsQueryRewrite
{
    public static ItemsQueryArgs? Rewrite(ItemsQueryArgs args, CategorySet categories)
    {
        var boxSetsOnly = args.IncludeItemTypes.Count == 1 && args.IncludeItemTypes[0] == BaseItemKind.BoxSet;
        ItemsQueryArgs result;
        switch (args.Parent)
        {
            case ParentKind.CategoriesLibrary when boxSetsOnly || args.IncludeItemTypes.Count == 0:
                result = args with { IncludeItemTypes = [], ExcludeItemIds = Union(args.ExcludeItemIds, categories.Children) };
                break;
            case ParentKind.None or ParentKind.Other when boxSetsOnly:
                result = args with { ExcludeItemIds = Union(args.ExcludeItemIds, categories.All) };
                break;
            default:
                return null;
        }

        var unchanged = result.IncludeItemTypes.SequenceEqual(args.IncludeItemTypes)
            && result.ExcludeItemIds.Count == args.ExcludeItemIds.Count;
        return unchanged ? null : result;
    }

    private static Guid[] Union(IReadOnlyList<Guid> existing, IReadOnlySet<Guid> extra)
        => existing.Concat(extra).Distinct().ToArray();
}

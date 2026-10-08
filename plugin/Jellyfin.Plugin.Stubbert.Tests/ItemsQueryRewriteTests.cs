using Jellyfin.Data.Enums;
using Xunit;

namespace Jellyfin.Plugin.Stubbert.Tests;

public class ItemsQueryRewriteTests
{
    private static readonly Guid Disney = Guid.NewGuid();
    private static readonly Guid Pixar = Guid.NewGuid();
    private static readonly Guid Movie = Guid.NewGuid();
    private static readonly Guid Other = Guid.NewGuid();

    private static readonly CategorySet Categories = CategorySet.Build([
        (Disney, [Pixar, Movie]),
        (Pixar, [Movie]),
    ]);

    private static ItemsQueryArgs Args(ParentKind parent, BaseItemKind[] types, params Guid[] exclude) => new(parent, types, exclude);

    [Fact]
    public void CategoriesLibraryBoxSetListingClearsTypesAndHidesChildren()
    {
        var result = ItemsQueryRewrite.Rewrite(Args(ParentKind.CategoriesLibrary, [BaseItemKind.BoxSet]), Categories);

        Assert.NotNull(result);
        Assert.Empty(result.IncludeItemTypes);
        Assert.Equal([Pixar], result.ExcludeItemIds);
    }

    [Fact]
    public void CategoriesLibraryBoxSetListingIsRewrittenEvenWithoutCategories()
    {
        var result = ItemsQueryRewrite.Rewrite(Args(ParentKind.CategoriesLibrary, [BaseItemKind.BoxSet]), CategorySet.Empty);

        Assert.NotNull(result);
        Assert.Empty(result.IncludeItemTypes);
        Assert.Empty(result.ExcludeItemIds);
    }

    [Fact]
    public void CategoriesLibraryUntypedListingHidesChildren()
    {
        var result = ItemsQueryRewrite.Rewrite(Args(ParentKind.CategoriesLibrary, []), Categories);

        Assert.NotNull(result);
        Assert.Equal([Pixar], result.ExcludeItemIds);
    }

    [Fact]
    public void CategoriesLibraryUntypedListingWithoutChildrenIsUnchanged()
    {
        var flat = CategorySet.Build([(Disney, [Movie])]);
        Assert.Null(ItemsQueryRewrite.Rewrite(Args(ParentKind.CategoriesLibrary, []), flat));
    }

    [Fact]
    public void CategoriesLibraryOtherTypesAreUnchanged()
    {
        Assert.Null(ItemsQueryRewrite.Rewrite(Args(ParentKind.CategoriesLibrary, [BaseItemKind.Movie]), Categories));
    }

    [Theory]
    [InlineData(ParentKind.None)]
    [InlineData(ParentKind.Other)]
    public void OtherBoxSetListingsHideAllCategories(ParentKind parent)
    {
        var result = ItemsQueryRewrite.Rewrite(Args(parent, [BaseItemKind.BoxSet], Other), Categories);

        Assert.NotNull(result);
        Assert.Equal([BaseItemKind.BoxSet], result.IncludeItemTypes);
        Assert.Equal(new HashSet<Guid> { Other, Disney, Pixar }, result.ExcludeItemIds.ToHashSet());
    }

    [Fact]
    public void OtherBoxSetListingsWithoutCategoriesAreUnchanged()
    {
        Assert.Null(ItemsQueryRewrite.Rewrite(Args(ParentKind.Other, [BaseItemKind.BoxSet]), CategorySet.Empty));
    }

    [Fact]
    public void OpeningACollectionIsUnchanged()
    {
        Assert.Null(ItemsQueryRewrite.Rewrite(Args(ParentKind.BoxSet, []), Categories));
        Assert.Null(ItemsQueryRewrite.Rewrite(Args(ParentKind.BoxSet, [BaseItemKind.BoxSet]), Categories));
    }

    [Fact]
    public void MixedTypeListingsAreUnchanged()
    {
        Assert.Null(ItemsQueryRewrite.Rewrite(Args(ParentKind.Other, [BaseItemKind.Movie, BaseItemKind.BoxSet]), Categories));
        Assert.Null(ItemsQueryRewrite.Rewrite(Args(ParentKind.None, [BaseItemKind.Movie]), Categories));
    }

    [Fact]
    public void ExistingExcludesAreKeptWithoutDuplicates()
    {
        var result = ItemsQueryRewrite.Rewrite(Args(ParentKind.None, [BaseItemKind.BoxSet], Disney), Categories);

        Assert.NotNull(result);
        Assert.Equal(2, result.ExcludeItemIds.Count);
    }
}

public class CategorySetTests
{
    [Fact]
    public void ChildrenAreCategoriesLinkedFromAnotherCategory()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var c = Guid.NewGuid();
        var movie = Guid.NewGuid();

        var set = CategorySet.Build([(a, [b, movie]), (b, [c]), (c, [])]);

        Assert.Equal(new HashSet<Guid> { a, b, c }, set.All.ToHashSet());
        Assert.Equal(new HashSet<Guid> { b, c }, set.Children.ToHashSet());
    }

    [Fact]
    public void NonCategoryBoxSetMembersAreNotChildren()
    {
        var a = Guid.NewGuid();
        var foreignBoxSet = Guid.NewGuid();

        var set = CategorySet.Build([(a, [foreignBoxSet])]);

        Assert.Empty(set.Children);
    }

    [Fact]
    public void SelfLinkIsIgnored()
    {
        var a = Guid.NewGuid();
        Assert.Empty(CategorySet.Build([(a, [a])]).Children);
    }
}

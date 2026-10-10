namespace Jellyfin.Plugin.Stubbert.Tests;

public class AddedDatesTests
{
    private static readonly TimeSpan Month = TimeSpan.FromDays(30);
    private static readonly DateTime Jan = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Mar = new(2026, 3, 1, 0, 0, 0, DateTimeKind.Utc);
    private const string Key = "movie:/media/movies/Dune (2021)";

    [Fact]
    public void FirstSightingKeepsItsOwnDate()
    {
        var dates = new AddedDates();

        Assert.Null(dates.Seen(Key, Guid.NewGuid(), Jan, Jan, Month));
        Assert.Equal(Jan, dates.Entries[Key].First);
    }

    [Fact]
    public void UpgradeAfterRemovalGetsTheFirstDate()
    {
        var dates = new AddedDates();
        var old = Guid.NewGuid();
        dates.Seen(Key, old, Jan, Jan, Month);

        dates.Removed(Key, old, Mar);

        Assert.Equal(Jan, dates.Seen(Key, Guid.NewGuid(), Mar, Mar, Month));
        Assert.Null(dates.Entries[Key].GoneSince);
    }

    [Fact]
    public void UpgradeBeforeRemovalGetsTheFirstDateAndStaysKnown()
    {
        var dates = new AddedDates();
        var old = Guid.NewGuid();
        var upgrade = Guid.NewGuid();
        dates.Seen(Key, old, Jan, Jan, Month);

        Assert.Equal(Jan, dates.Seen(Key, upgrade, Mar, Mar, Month));
        dates.Removed(Key, old, Mar);

        Assert.Null(dates.Entries[Key].GoneSince);
        Assert.Equal([upgrade], dates.Entries[Key].Items);
    }

    [Fact]
    public void SamePathReplacementGetsItsDateBack()
    {
        var dates = new AddedDates();
        var id = Guid.NewGuid();
        dates.Seen(Key, id, Jan, Jan, Month);

        Assert.Equal(Jan, dates.Seen(Key, id, Mar, Mar, Month));
        Assert.Null(dates.Seen(Key, id, Jan, Mar, Month));
    }

    [Fact]
    public void AnEarlierDateBecomesTheFirstDate()
    {
        var dates = new AddedDates();
        dates.Seen(Key, Guid.NewGuid(), Mar, Mar, Month);

        Assert.Null(dates.Seen(Key, Guid.NewGuid(), Jan, Mar, Month));
        Assert.Equal(Jan, dates.Entries[Key].First);
    }

    [Fact]
    public void TitleGoneLongerThanTheLimitCountsAsNew()
    {
        var dates = new AddedDates();
        var old = Guid.NewGuid();
        dates.Seen(Key, old, Jan, Jan, Month);
        dates.Removed(Key, old, Jan);

        Assert.Null(dates.Seen(Key, Guid.NewGuid(), Mar, Mar, Month));
        Assert.Equal(Mar, dates.Entries[Key].First);
    }

    [Fact]
    public void ReconcileRestoresDatesAndMarksMissingTitlesGone()
    {
        var dates = new AddedDates();
        var gone = Guid.NewGuid();
        dates.Seen(Key, Guid.NewGuid(), Jan, Jan, Month);
        dates.Seen("movie:/media/movies/Alien (1979)", gone, Jan, Jan, Month);
        var upgrade = Guid.NewGuid();

        var changes = dates.Reconcile([(Key, upgrade, Mar)], Mar, Month);

        Assert.Equal([(upgrade, Jan)], changes);
        Assert.Equal(Mar, dates.Entries["movie:/media/movies/Alien (1979)"].GoneSince);
        Assert.Equal([upgrade], dates.Entries[Key].Items);
    }

    [Fact]
    public void PruneDropsOnlyTitlesGoneTooLong()
    {
        var dates = new AddedDates();
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        dates.Seen("a", a, Jan, Jan, Month);
        dates.Seen("b", b, Jan, Jan, Month);
        dates.Removed("a", a, Jan);
        dates.Removed("b", b, Mar);

        Assert.Equal(1, dates.Prune(Mar.AddDays(1), Month));
        Assert.Equal(["b"], dates.Entries.Keys);
    }

    [Theory]
    [InlineData("/media/movies/Dune", false, null, null, "movie:/media/movies/Dune")]
    [InlineData("/media/movies", true, "438631", "tt1160419", "movie:tmdb:438631")]
    [InlineData("/media/movies", true, null, "tt1160419", "movie:imdb:tt1160419")]
    [InlineData("/media/movies", true, null, null, null)]
    public void MovieKeyUsesTheFolderUnlessItIsShared(string folder, bool mixed, string? tmdb, string? imdb, string? key)
        => Assert.Equal(key, AddedDates.MovieKey(folder, mixed, tmdb, imdb));

    [Fact]
    public void EpisodeKeyNeedsSeriesSeasonAndNumber()
    {
        var series = Guid.NewGuid();

        Assert.Equal($"episode:{series:N}:1:2", AddedDates.EpisodeKey(series, 1, 2));
        Assert.Null(AddedDates.EpisodeKey(series, 1, null));
        Assert.Null(AddedDates.EpisodeKey(Guid.Empty, 1, 2));
    }
}

using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.Stubbert.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    public string CategoriesLibraryId { get; set; } = string.Empty;

    public bool KeepAddedDates { get; set; }

    public int ForgetAddedDatesAfterDays { get; set; } = 30;
}

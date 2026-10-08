using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.Stubbert.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    public string CategoriesLibraryId { get; set; } = string.Empty;
}

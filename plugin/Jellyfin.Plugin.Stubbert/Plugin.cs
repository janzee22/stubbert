using Jellyfin.Plugin.Stubbert.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.Stubbert;

public class Plugin : BasePlugin<PluginConfiguration>
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public static Plugin? Instance { get; private set; }

    public override string Name => "Stubbert";

    public override Guid Id => Guid.Parse("efa3a80a-43c3-4a51-900d-dffbd1bd0ce0");

    public override string Description => "Shows only category collections in a dedicated Categories library.";
}

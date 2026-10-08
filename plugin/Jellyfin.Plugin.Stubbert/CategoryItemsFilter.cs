using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Stubbert;

public sealed class CategoryItemsFilter : IAsyncActionFilter
{
    private const string ParentIdArg = "parentId";
    private const string IncludeItemTypesArg = "includeItemTypes";
    private const string ExcludeItemIdsArg = "excludeItemIds";

    private readonly CategoryScope _scope;
    private readonly ILibraryManager _libraryManager;
    private readonly ILogger<CategoryItemsFilter> _logger;

    public CategoryItemsFilter(CategoryScope scope, ILibraryManager libraryManager, ILogger<CategoryItemsFilter> logger)
    {
        _scope = scope;
        _libraryManager = libraryManager;
        _logger = logger;
    }

    public Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (context.ActionDescriptor is ControllerActionDescriptor { ControllerName: "Items", ActionName: "GetItems" }
            && CategoryScope.ConfiguredLibraryId is { } libraryId)
        {
            try
            {
                Apply(context.ActionArguments, libraryId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Stubbert] Failed to rewrite GetItems arguments");
            }
        }

        return next();
    }

    private void Apply(IDictionary<string, object?> args, Guid libraryId)
    {
        var parentId = args.TryGetValue(ParentIdArg, out var p) ? p as Guid? : null;
        var parent = parentId switch
        {
            null => ParentKind.None,
            { } id when id == libraryId => ParentKind.CategoriesLibrary,
            { } id when _libraryManager.GetItemById(id) is BoxSet => ParentKind.BoxSet,
            _ => ParentKind.Other,
        };
        var types = args.TryGetValue(IncludeItemTypesArg, out var t) && t is BaseItemKind[] ta ? ta : [];
        var exclude = args.TryGetValue(ExcludeItemIdsArg, out var e) && e is Guid[] ea ? ea : [];

        var rewritten = ItemsQueryRewrite.Rewrite(new ItemsQueryArgs(parent, types, exclude), _scope.GetCategories());
        if (rewritten is null)
        {
            return;
        }

        args[IncludeItemTypesArg] = rewritten.IncludeItemTypes.ToArray();
        args[ExcludeItemIdsArg] = rewritten.ExcludeItemIds.ToArray();
        _logger.LogDebug(
            "[Stubbert] GetItems parent={Parent} includeItemTypes [{Before}] -> [{After}], excluded {Count} ids",
            parent,
            string.Join(',', types),
            string.Join(',', rewritten.IncludeItemTypes),
            rewritten.ExcludeItemIds.Count);
    }
}

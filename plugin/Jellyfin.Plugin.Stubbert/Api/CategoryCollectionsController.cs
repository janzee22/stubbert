using System.ComponentModel.DataAnnotations;
using Jellyfin.Data.Enums;
using MediaBrowser.Common.Api;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Providers;
using MediaBrowser.Model.IO;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Stubbert.Api;

public sealed record CategoryCollectionDto(Guid Id, string Name, string Path, bool IsChild);

public sealed record CategoriesFolderDto(string Path, bool Exists);

[ApiController]
[Route("CategoryCollections")]
[Authorize(Policy = Policies.RequiresElevation)]
public class CategoryCollectionsController : ControllerBase
{
    private const string MarkerFileName = ".categories-library";
    private const string DefaultFolderName = "categories";

    private readonly CategoryScope _scope;
    private readonly ILibraryManager _libraryManager;
    private readonly ILibraryMonitor _libraryMonitor;
    private readonly IProviderManager _providerManager;
    private readonly IFileSystem _fileSystem;
    private readonly IApplicationPaths _appPaths;

    public CategoryCollectionsController(
        CategoryScope scope,
        ILibraryManager libraryManager,
        ILibraryMonitor libraryMonitor,
        IProviderManager providerManager,
        IFileSystem fileSystem,
        IApplicationPaths appPaths)
    {
        _scope = scope;
        _libraryManager = libraryManager;
        _libraryMonitor = libraryMonitor;
        _providerManager = providerManager;
        _fileSystem = fileSystem;
        _appPaths = appPaths;
    }

    private string DefaultFolder => Path.Combine(_appPaths.DataPath, DefaultFolderName);

    [HttpGet("Folder")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<CategoriesFolderDto> GetFolder()
    {
        return Ok(new CategoriesFolderDto(DefaultFolder, Directory.Exists(DefaultFolder)));
    }

    [HttpPost("Folder")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public ActionResult<CategoriesFolderDto> CreateFolder()
    {
        try
        {
            Directory.CreateDirectory(DefaultFolder);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return BadRequest($"Cannot create \"{DefaultFolder}\": {e.Message}");
        }

        return Ok(new CategoriesFolderDto(DefaultFolder, true));
    }

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<IEnumerable<CategoryCollectionDto>> List()
    {
        var children = _scope.GetCategories().Children;
        return Ok(_scope.GetCategoryItems().Select(b => new CategoryCollectionDto(b.Id, b.Name, b.Path, children.Contains(b.Id))));
    }

    [HttpPost]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CategoryCollectionDto>> Create([FromQuery, Required] string name, CancellationToken cancellationToken)
    {
        name = name.Trim();
        if (name.Length == 0)
        {
            return BadRequest("Name is empty.");
        }

        var library = _scope.GetLibrary();
        if (library is null)
        {
            return BadRequest("CategoriesLibraryId is not configured or does not point at a library.");
        }

        if (library.CollectionType != CollectionType.boxsets)
        {
            return BadRequest($"Library \"{library.Name}\" is not a boxsets library.");
        }

        var root = _scope.GetLocations().FirstOrDefault();
        if (root is null)
        {
            return BadRequest($"Library \"{library.Name}\" has no folder.");
        }

        Folder? parent;
        try
        {
            parent = await GetLibraryRootAsync(root, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return BadRequest($"Cannot write to \"{root}\": {e.Message}");
        }

        if (parent is null)
        {
            return BadRequest($"Jellyfin has no item for the folder \"{root}\". Check that it exists and Jellyfin can read it.");
        }

        if (_scope.GetCategoryItems().Any(b => string.Equals(b.Name, name, StringComparison.OrdinalIgnoreCase)))
        {
            return Conflict($"A category named \"{name}\" already exists.");
        }

        var path = Path.Combine(root, _fileSystem.GetValidFilename(name) + " [boxset]");
        if (Directory.Exists(path))
        {
            return Conflict($"Folder \"{path}\" already exists.");
        }

        _libraryMonitor.ReportFileSystemChangeBeginning(path);
        try
        {
            var info = Directory.CreateDirectory(path);
            var boxSet = new BoxSet
            {
                Name = name,
                Path = path,
                DateCreated = info.CreationTimeUtc,
                DateModified = info.LastWriteTimeUtc,
            };
            parent.AddChild(boxSet);
            _providerManager.QueueRefresh(boxSet.Id, new MetadataRefreshOptions(new DirectoryService(_fileSystem)), RefreshPriority.High);
            _scope.Invalidate();
            return Ok(new CategoryCollectionDto(boxSet.Id, boxSet.Name, boxSet.Path, false));
        }
        finally
        {
            _libraryMonitor.ReportFileSystemChangeComplete(path, false);
        }
    }

    private async Task<Folder?> GetLibraryRootAsync(string root, CancellationToken cancellationToken)
    {
        if (_libraryManager.FindByPath(root, true) is Folder existing)
        {
            return existing;
        }

        if (!Directory.Exists(root))
        {
            return null;
        }

        if (!Directory.EnumerateFileSystemEntries(root).Any())
        {
            await System.IO.File.WriteAllTextAsync(
                Path.Combine(root, MarkerFileName),
                "Keeps this Categories library folder non-empty so Jellyfin scans it. Created by the Stubbert plugin.\n",
                cancellationToken).ConfigureAwait(false);
        }

        await _libraryManager.RootFolder.ValidateChildren(
            new Progress<double>(),
            new MetadataRefreshOptions(new DirectoryService(_fileSystem)),
            recursive: false,
            allowRemoveRoot: false,
            cancellationToken).ConfigureAwait(false);
        return _libraryManager.FindByPath(root, true) as Folder;
    }
}

using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace Careflow.Api.Services;

public static class SwaggerConfiguration
{
    public static IServiceCollection AddClinicSwagger(this IServiceCollection services)
    {
        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen(options =>
        {
            options.SwaggerDoc("v1", new OpenApiInfo
            {
                Title = "Careflow API",
                Version = "v1",
                Description = "Local development API explorer. Click Authorize and enter the ApiKey from Manage User Secrets " +
                    "(the same value as API_KEY in .env). Start with GET /api/workspace to obtain patient IDs, location IDs, and providers. " +
                    "Try it out calls the running API and saves changes to the connected database."
            });
            options.AddSecurityDefinition("ApiKey", new OpenApiSecurityScheme
            {
                Type = SecuritySchemeType.ApiKey,
                Name = "X-Api-Key",
                In = ParameterLocation.Header,
                Description = "Paste your development API key only. No Bearer prefix is required."
            });
            options.OperationFilter<ClinicApiKeyOperationFilter>();
        });
        return services;
    }

    public static WebApplication UseClinicSwagger(this WebApplication app)
    {
        app.UseSwagger();
        app.UseSwaggerUI(options =>
        {
            options.SwaggerEndpoint("./v1/swagger.json", "Careflow API v1");
            options.DocumentTitle = "Careflow API — Swagger UI";
            options.DisplayRequestDuration();
            options.EnableFilter();
            // Authorization persistence is left disabled so API keys are not saved in browser storage.
        });
        return app;
    }
}

public sealed class ClinicApiKeyOperationFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        if (context.ApiDescription.RelativePath?.StartsWith("api/", StringComparison.Ordinal) != true)
        {
            operation.Security = [];
            return;
        }

        operation.Security =
        [
            new OpenApiSecurityRequirement
            {
                [new OpenApiSecuritySchemeReference("ApiKey", context.Document)] = []
            }
        ];
        operation.Responses ??= new OpenApiResponses();
        operation.Responses.TryAdd("401", new OpenApiResponse
        {
            Description = "Missing or invalid X-Api-Key header. Use the Authorize button to provide your development API key."
        });
    }
}

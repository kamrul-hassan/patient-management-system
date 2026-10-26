using System.Security.Cryptography;
using System.Text;

namespace Careflow.Api.Services;

public sealed class ApiKeyMiddleware(RequestDelegate next, IConfiguration configuration)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (context.Request.Path.StartsWithSegments("/health")) { await next(context); return; }
        var expected = configuration["ApiKey"] ?? "";
        var supplied = context.Request.Headers["X-Api-Key"].ToString();
        if (expected.Length < 32 || !CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(expected)), SHA256.HashData(Encoding.UTF8.GetBytes(supplied))))
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new { title = "Unauthorized", detail = "A valid server API key is required." });
            return;
        }
        await next(context);
    }
}

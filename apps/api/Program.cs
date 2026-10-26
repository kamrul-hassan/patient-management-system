using Careflow.Api.Data;
using Careflow.Api.Endpoints;
using Careflow.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.RateLimiting;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddProblemDetails();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles);
if (builder.Environment.IsDevelopment()) builder.Services.AddClinicSwagger();
var demo = builder.Configuration["Database:Provider"] == "InMemory";
if (demo && !builder.Environment.IsDevelopment()) throw new InvalidOperationException("Demo storage is allowed only in Development.");
if ((builder.Configuration["ApiKey"] ?? "").Length < 32) throw new InvalidOperationException("Set ApiKey to a random value of at least 32 characters.");
builder.Services.AddDbContext<ClinicDbContext>(options =>
{
    if (demo) options.UseInMemoryDatabase("CareflowDemo");
    else options.UseNpgsql(builder.Configuration.GetConnectionString("Careflow"));
});
builder.Services.AddRateLimiter(options => options.AddFixedWindowLimiter("api", limit =>
{
    limit.PermitLimit = 180; limit.Window = TimeSpan.FromMinutes(1); limit.QueueLimit = 0;
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
}));
var app = builder.Build();
app.UseExceptionHandler();
app.Use(async (context, next) =>
{
    context.Response.Headers.CacheControl = "no-store";
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    await next();
});
// Serve only development documentation before API-key checks. Actual clinic endpoints stay protected.
if (app.Environment.IsDevelopment()) app.UseClinicSwagger();
app.UseMiddleware<ApiKeyMiddleware>();
app.UseRateLimiter();
app.MapGet("/health", () => Results.Ok(new { status = "healthy", storage = demo ? "demo-memory" : "postgresql" }))
    .WithName("GetHealth").WithTags("Health").WithSummary("Check API health and storage mode.");
app.MapClinicEndpoints();
await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ClinicDbContext>();
    if (!demo) await db.Database.MigrateAsync();
    if (builder.Configuration.GetValue<bool>("SeedDemoData")) await SeedData.InitializeAsync(db, builder.Configuration["ClinicTimeZone"] ?? "Asia/Dhaka");
}
app.Run();

public partial class Program;

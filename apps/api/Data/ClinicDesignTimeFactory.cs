using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Careflow.Api.Data;

public sealed class ClinicDesignTimeFactory : IDesignTimeDbContextFactory<ClinicDbContext>
{
    public ClinicDbContext CreateDbContext(string[] args)
    {
        var configuration = new ConfigurationBuilder()
            .AddUserSecrets<ClinicDesignTimeFactory>(optional: true)
            .AddEnvironmentVariables()
            .AddKeyPerFile("/run/secrets", optional: true)
            .Build();
        var connection = configuration.GetConnectionString("Careflow");
        if (string.IsNullOrWhiteSpace(connection))
            throw new InvalidOperationException("Set ConnectionStrings__Careflow or the Careflow connection in User Secrets before running EF tools.");
        var options = new DbContextOptionsBuilder<ClinicDbContext>()
            .UseNpgsql(connection).Options;
        return new ClinicDbContext(options);
    }
}

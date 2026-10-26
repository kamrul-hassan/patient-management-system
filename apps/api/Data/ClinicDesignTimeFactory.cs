using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Careflow.Api.Data;

public sealed class ClinicDesignTimeFactory : IDesignTimeDbContextFactory<ClinicDbContext>
{
    public ClinicDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<ClinicDbContext>()
            .UseNpgsql("Host=localhost;Database=careflow;Username=careflow").Options;
        return new ClinicDbContext(options);
    }
}

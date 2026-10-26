using Npgsql;
using Microsoft.Extensions.Configuration;

namespace Careflow.Api.Services;

public static class DatabaseConfiguration
{
    public static string Validate(IConfiguration configuration, bool development, bool migrations)
    {
        NpgsqlConnectionStringBuilder connection;
        try
        {
            connection = new NpgsqlConnectionStringBuilder(configuration.GetConnectionString("Careflow"));
        }
        catch (ArgumentException)
        {
            // Never include the supplied connection string in an exception or log.
            throw new InvalidOperationException("Configure a valid Careflow database connection.");
        }
        if (string.IsNullOrWhiteSpace(connection.Host) || string.IsNullOrWhiteSpace(connection.Database) || string.IsNullOrWhiteSpace(connection.Username))
            throw new InvalidOperationException("Configure the database host, database name, and login through secrets.");
        if (!development)
        {
            if (string.IsNullOrWhiteSpace(connection.Password) || connection.Password.StartsWith("replace-", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Configure a database password through secrets.");
            if (!migrations && connection.Username.Equals("postgres", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("The API must use a dedicated non-administrator database login.");
            if (!configuration.GetValue<bool>("Database:AllowUnencryptedConnection") && connection.SslMode != SslMode.VerifyFull)
                throw new InvalidOperationException("Use SSL Mode=VerifyFull for external databases. Only a private Docker network may explicitly allow unencrypted connections.");
            if (connection.IncludeErrorDetail || connection.LogParameters || connection.PersistSecurityInfo)
                throw new InvalidOperationException("Database error details, parameter logging, and persistent security information must be disabled.");
        }
        return connection.ConnectionString;
    }
}

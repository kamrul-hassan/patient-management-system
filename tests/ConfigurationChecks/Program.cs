using Careflow.Api.Services;
using Microsoft.Extensions.Configuration;
using System.Security.Cryptography;

var password = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
var baseConnection = $"Host=database.example;Database=app;Username=runtime;Password={password}";
var checks = 0;
IConfiguration Configuration(string? connection, bool allowPrivateTransport = false) =>
    new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["ConnectionStrings:Careflow"] = connection,
        ["Database:AllowUnencryptedConnection"] = allowPrivateTransport.ToString()
    }).Build();
void Reject(string? connection, bool migrations = false)
{
    try
    {
        DatabaseConfiguration.Validate(Configuration(connection), false, migrations);
    }
    catch (InvalidOperationException exception)
    {
        if (exception.ToString().Contains(password, StringComparison.Ordinal))
            throw new Exception("Configuration errors must never expose supplied passwords.");
        checks++;
        return;
    }
    throw new Exception("An unsafe production connection was accepted.");
}
Reject(null);
Reject(baseConnection + ";UnknownSetting=true");
Reject("Host=database.example;Database=app;Username=runtime;SSL Mode=VerifyFull");
Reject(baseConnection + ";SSL Mode=Prefer");
Reject(baseConnection + ";SSL Mode=Require");
Reject(baseConnection.Replace("Username=runtime", "Username=postgres") + ";SSL Mode=VerifyFull");
Reject(baseConnection + ";SSL Mode=VerifyFull;Include Error Detail=true");
Reject(baseConnection + ";SSL Mode=VerifyFull;Log Parameters=true");
Reject(baseConnection + ";SSL Mode=VerifyFull;Persist Security Info=true");
DatabaseConfiguration.Validate(Configuration(baseConnection + ";SSL Mode=VerifyFull"), false, false);
checks++;
DatabaseConfiguration.Validate(Configuration(baseConnection.Replace("Username=runtime", "Username=postgres") + ";SSL Mode=VerifyFull"), false, true);
checks++;
DatabaseConfiguration.Validate(Configuration(baseConnection.Replace("Host=database.example", "Host=db"), true), false, false);
checks++;
DatabaseConfiguration.Validate(Configuration("Host=localhost;Database=dev;Username=dev"), true, false);
checks++;
Console.WriteLine($"PASS: {checks} configuration checks (verified TLS, private-network opt-in, missing passwords, runtime admin rejection, sensitive logging, safe errors).");

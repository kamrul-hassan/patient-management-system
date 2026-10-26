using System.ComponentModel.DataAnnotations;

namespace Careflow.Api.Endpoints;

public sealed record CreateLocation([property: Required, StringLength(120)] string Name, [property: Required, StringLength(500)] string Address);

public sealed record CreatePatient(
    [property: Required, StringLength(120, MinimumLength = 2)] string Name,
    [property: Required, EmailAddress, StringLength(254)] string Email,
    [property: Required, StringLength(40)] string Phone,
    DateOnly DateOfBirth, Guid LocationId,
    [property: StringLength(10)] string BloodGroup = "Unknown",
    [property: StringLength(1000)] string Allergies = "None recorded");
public sealed record CreateAppointment(Guid PatientId, Guid LocationId,
    [property: Required, StringLength(120)] string Provider, [property: Required] string Type,
    DateTime StartsAt, [property: Range(15, 120)] int DurationMinutes, [property: StringLength(1000)] string Reason);
public sealed record UpdateAppointment([property: Required] string Status);
public sealed record CreateRecord(Guid PatientId,
    [property: Required, StringLength(250)] string Diagnosis, [property: Required, StringLength(10000)] string Notes,
    [property: Required, StringLength(120)] string Provider, [property: StringLength(3000)] string Prescription, [property: StringLength(3000)] string FollowUp);
public sealed record CreateInvoice(Guid PatientId, Guid LocationId,
    [property: Required, StringLength(250)] string Description, [property: Range(typeof(decimal), "0.01", "1000000")] decimal Amount, DateTime DueAt);
public sealed record CreateConsent(Guid PatientId, [property: Required, StringLength(200)] string Title, [property: Required, StringLength(10000)] string Body);
public sealed record SignConsent([property: Required, StringLength(120, MinimumLength = 2)] string Signature, bool Accepted);
public sealed record CreateMessage(Guid PatientId, [property: Required, StringLength(200)] string Subject, [property: Required, StringLength(10000)] string Body);
public sealed record CreateTrial([property: Required, StringLength(120)] string ClinicName, [property: Required, EmailAddress, StringLength(254)] string Email);

public static class RequestValidation
{
    public static Dictionary<string, string[]>? Errors<T>(T request)
    {
        var results = new List<ValidationResult>();
        if (Validator.TryValidateObject(request!, new ValidationContext(request!), results, true)) return null;
        return results.SelectMany(r => r.MemberNames.Select(name => (name, message: r.ErrorMessage ?? "Invalid value")))
            .GroupBy(x => x.name).ToDictionary(g => g.Key, g => g.Select(x => x.message).ToArray());
    }
}

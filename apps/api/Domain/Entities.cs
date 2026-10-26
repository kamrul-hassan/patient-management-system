namespace Careflow.Api.Domain;

public sealed class Location
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public required string Address { get; set; }
}

public sealed class Patient
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public required string Email { get; set; }
    public required string Phone { get; set; }
    public DateOnly DateOfBirth { get; set; }
    public Guid LocationId { get; set; }
    public string BloodGroup { get; set; } = "Unknown";
    public string Allergies { get; set; } = "None recorded";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class Appointment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public Guid LocationId { get; set; }
    public required string Provider { get; set; }
    public required string Type { get; set; }
    public DateTime StartsAt { get; set; }
    public int DurationMinutes { get; set; } = 30;
    public string Status { get; set; } = "Confirmed";
    public string Reason { get; set; } = "";
}

public sealed class MedicalRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public required string Diagnosis { get; set; }
    public required string Notes { get; set; }
    public required string Provider { get; set; }
    public string Prescription { get; set; } = "";
    public string FollowUp { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class Invoice
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public Guid LocationId { get; set; }
    public required string Number { get; set; }
    public required string Description { get; set; }
    public decimal Amount { get; set; }
    public string Status { get; set; } = "Pending";
    public DateTime IssuedAt { get; set; } = DateTime.UtcNow;
    public DateTime DueAt { get; set; }
    public DateTime? PaidAt { get; set; }
}

public sealed class ConsentForm
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public required string Title { get; set; }
    public required string Body { get; set; }
    public string? Signature { get; set; }
    public DateTime? SignedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class PatientMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public required string Subject { get; set; }
    public required string Body { get; set; }
    public string Channel { get; set; } = "Portal";
    public string Direction { get; set; } = "Outbound";
    public bool IsRead { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class TrialRegistration
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string ClinicName { get; set; }
    public required string Email { get; set; }
    public DateTime StartsAt { get; set; } = DateTime.UtcNow;
    public DateTime EndsAt { get; set; } = DateTime.UtcNow.AddDays(14);
}

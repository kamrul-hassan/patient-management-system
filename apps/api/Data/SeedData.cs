using Careflow.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Careflow.Api.Data;

public static class SeedData
{
    public static async Task InitializeAsync(ClinicDbContext db, string timeZoneId = "Asia/Dhaka")
    {
        if (await db.Locations.AnyAsync()) return;
        var downtown = new Location { Id = Guid.NewGuid(), Name = "Downtown Clinic", Address = "120 Madison Avenue, New York" };
        var westside = new Location { Id = Guid.NewGuid(), Name = "Westside Wellness", Address = "85 West End Avenue, New York" };
        var brooklyn = new Location { Id = Guid.NewGuid(), Name = "Brooklyn Care", Address = "42 Atlantic Avenue, Brooklyn" };
        db.Locations.AddRange(downtown, westside, brooklyn);
        string[] names = ["Olivia Rhye", "Phoenix Baker", "Lana Steiner", "Demi Wilkinson", "Drew Cano", "Natali Craig", "Orlando Diggs", "Andi Lane", "Kate Morrison", "Alex Morgan", "Sophie Moore", "James Wilson"];
        var clinicZone = TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
        var clinicDate = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, clinicZone).Date;
        var today = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(clinicDate, DateTimeKind.Unspecified), clinicZone);
        var patients = names.Select((name, i) => new Patient
        {
            Name = name,
            Email = name.ToLowerInvariant().Replace(' ', '.') + "@example.com",
            Phone = $"+1 (212) 555-{1000 + i}",
            DateOfBirth = new DateOnly(1985 + i % 15, i % 12 + 1, 12),
            LocationId = i < 8 ? downtown.Id : i < 10 ? westside.Id : brooklyn.Id,
            BloodGroup = i % 2 == 0 ? "O+" : "A+",
            Allergies = i == 2 ? "Penicillin" : "None recorded",
            CreatedAt = today.AddDays(-60 + i * 3)
        }).ToArray();
        db.Patients.AddRange(patients);
        string[] types = ["Consultation", "Follow-up", "Telemedicine", "Check-up", "Consultation", "Telemedicine", "Follow-up", "Check-up"];
        string[] statuses = ["Completed", "Completed", "In progress", "Confirmed", "Checked in", "Confirmed", "Pending", "Confirmed"];
        for (var i = 0; i < 8; i++)
            db.Appointments.Add(new Appointment { PatientId = patients[i].Id, LocationId = patients[i].LocationId, Provider = i % 2 == 0 ? "Dr. Sarah Mitchell" : "Dr. James Chen", Type = types[i], Status = statuses[i], StartsAt = today.AddHours(9).AddMinutes(i * 45), Reason = i % 2 == 0 ? "Routine health consultation" : "Review and follow-up" });
        for (var day = 1; day <= 60; day++)
            for (var i = 0; i < 3 + day % 5; i++)
            {
                var patient = patients[(day + i) % patients.Length];
                db.Appointments.Add(new Appointment { PatientId = patient.Id, LocationId = patient.LocationId, Provider = i % 2 == 0 ? "Dr. Sarah Mitchell" : "Dr. James Chen", Type = types[i % 8], Status = day % 11 == 0 ? "Cancelled" : "Completed", StartsAt = today.AddDays(-day).AddHours(9 + i) });
            }
        foreach (var (patient, i) in patients.Select((p, i) => (p, i)))
        {
            db.MedicalRecords.Add(new MedicalRecord { PatientId = patient.Id, Diagnosis = i % 2 == 0 ? "Annual wellness examination" : "Seasonal allergic rhinitis", Notes = "Patient is in good general health. Vitals reviewed. Discussed preventive care, balanced nutrition, and regular exercise.", Provider = "Dr. Sarah Mitchell", Prescription = i % 2 == 0 ? "No medication prescribed." : "Discussed over-the-counter symptom management.", FollowUp = "Schedule a routine follow-up in 3 months.", CreatedAt = today.AddDays(-i - 1) });
            db.ConsentForms.Add(new ConsentForm { PatientId = patient.Id, Title = "General treatment consent", Body = "I authorize the clinical team to perform the consultation and examination discussed with me. I understand the proposed care, have had an opportunity to ask questions, and understand that I may withdraw consent at any time. This consent does not authorize additional procedures without further discussion.", Signature = i < 7 ? patient.Name : null, SignedAt = i < 7 ? today.AddDays(-i) : null });
            db.Invoices.Add(new Invoice { PatientId = patient.Id, LocationId = patient.LocationId, Number = $"INV-2026-{1001 + i}", Description = i % 2 == 0 ? "General consultation" : "Follow-up consultation", Amount = i % 2 == 0 ? 180 : 120, Status = i < 7 ? "Paid" : "Pending", IssuedAt = today.AddDays(-i), DueAt = today.AddDays(14 - i), PaidAt = i < 7 ? today.AddDays(-i) : null });
        }
        db.Messages.AddRange(
            new PatientMessage { PatientId = patients[0].Id, Subject = "Question about my follow-up", Body = "Hi Dr. Mitchell, should I bring my previous lab results to my next appointment? Thank you!", Direction = "Inbound", CreatedAt = today.AddHours(8).AddMinutes(42) },
            new PatientMessage { PatientId = patients[2].Id, Subject = "Appointment confirmation", Body = "Thank you for confirming my appointment. I'll be there a few minutes early.", Direction = "Inbound", CreatedAt = today.AddHours(8).AddMinutes(15) },
            new PatientMessage { PatientId = patients[4].Id, Subject = "Visit summary available", Body = "Your visit summary is ready to review in the patient portal.", IsRead = true, CreatedAt = today.AddDays(-1).AddHours(16) });
        await db.SaveChangesAsync();
    }
}

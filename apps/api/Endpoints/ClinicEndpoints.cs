using Careflow.Api.Data;
using Careflow.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Careflow.Api.Endpoints;

public static class ClinicEndpoints
{
    private static readonly SemaphoreSlim SchedulingLock = new(1, 1);
    private static readonly SemaphoreSlim ConsentSigningLock = new(1, 1);
    private static readonly string[] AppointmentTypes = ["Consultation", "Follow-up", "Telemedicine", "Check-up"];
    private static readonly string[] Providers = ["Dr. Sarah Mitchell", "Dr. James Chen", "Dr. Emily Davis"];

    public static void MapClinicEndpoints(this WebApplication app)
    {
        var api = app.MapGroup("/api").RequireRateLimiting("api");
        api.MapGet("/workspace", GetWorkspace)
            .WithName("GetWorkspace").WithTags("Workspace").WithSummary("Load the clinic workspace, optionally filtered by location.")
            .WithDescription("Start here to obtain real patient IDs, location IDs, and available provider names for the other endpoints.");
        api.MapPost("/locations", AddLocation)
            .WithName("CreateLocation").WithTags("Locations").WithSummary("Create a clinic location.")
            .Produces<Location>(StatusCodes.Status201Created).ProducesValidationProblem();
        api.MapPost("/patients", AddPatient)
            .WithName("CreatePatient").WithTags("Patients").WithSummary("Register a patient at an existing location.")
            .Produces<Patient>(StatusCodes.Status201Created).ProducesValidationProblem();
        api.MapPost("/appointments", AddAppointment)
            .WithName("CreateAppointment").WithTags("Appointments").WithSummary("Schedule an appointment with overlap checks.")
            .WithDescription("Use a future UTC startsAt (ISO 8601 with Z), a provider from the workspace, and a type of Consultation, Follow-up, Telemedicine, or Check-up.")
            .Produces<Appointment>(StatusCodes.Status201Created).ProducesValidationProblem();
        api.MapPatch("/appointments/{id:guid}", UpdateAppointmentStatus)
            .WithName("UpdateAppointmentStatus").WithTags("Appointments").WithSummary("Check in, start, complete, confirm, or cancel a visit.")
            .WithDescription("Typical sequence: Confirmed → Checked in → In progress → Completed. Pending visits may be Confirmed. Active visits may be Cancelled.")
            .Produces<Appointment>().ProducesValidationProblem();
        api.MapPost("/records", AddRecord)
            .WithName("CreateMedicalRecord").WithTags("Medical records").WithSummary("Add a clinical record and post-visit summary.")
            .Produces<MedicalRecord>(StatusCodes.Status201Created).ProducesValidationProblem();
        api.MapPost("/invoices", AddInvoice)
            .WithName("CreateInvoice").WithTags("Billing").WithSummary("Create an invoice in USD.")
            .Produces<Invoice>(StatusCodes.Status201Created).ProducesValidationProblem();
        api.MapPost("/invoices/{id:guid}/pay", MarkInvoicePaid)
            .WithName("RecordInvoicePayment").WithTags("Billing").WithSummary("Record a payment in the ledger; no card is charged.")
            .Produces<Invoice>();
        api.MapPost("/consents", AddConsent)
            .WithName("CreateConsentForm").WithTags("Consent forms").WithSummary("Create consent terms for a patient to review.")
            .Produces<ConsentForm>(StatusCodes.Status201Created).ProducesValidationProblem();
        api.MapPost("/consents/{id:guid}/sign", SignConsentForm)
            .WithName("SignConsentForm").WithTags("Consent forms").WithSummary("Save an explicitly accepted acknowledgment.")
            .Produces<ConsentForm>().ProducesValidationProblem();
        api.MapPost("/messages", AddMessage)
            .WithName("CreatePatientMessage").WithTags("Messages").WithSummary("Save a message to the portal outbox; no email or SMS is sent.")
            .Produces<PatientMessage>(StatusCodes.Status201Created).ProducesValidationProblem();
        api.MapPatch("/messages/{id:guid}/read", MarkMessageRead)
            .WithName("MarkPatientMessageRead").WithTags("Messages").WithSummary("Mark a portal message as read.")
            .Produces(StatusCodes.Status204NoContent);
        api.MapPost("/trials", RegisterTrial)
            .WithName("RegisterTrial").WithTags("Trial registration").WithSummary("Register a 14-day evaluation request.")
            .Produces(StatusCodes.Status201Created).ProducesValidationProblem();
    }

    private static async Task<IResult> GetWorkspace(Guid? locationId, ClinicDbContext db, IConfiguration config, CancellationToken ct)
    {
        var locations = await db.Locations.AsNoTracking().OrderBy(l => l.Name).ToListAsync(ct);
        if (locationId.HasValue && !locations.Any(l => l.Id == locationId)) return Results.NotFound();
        var patients = await db.Patients.AsNoTracking().Where(p => !locationId.HasValue || p.LocationId == locationId ||
            db.Appointments.Any(a => a.PatientId == p.Id && a.LocationId == locationId) ||
            db.Invoices.Any(i => i.PatientId == p.Id && i.LocationId == locationId)).OrderBy(p => p.Name).ToListAsync(ct);
        var ids = patients.Select(p => p.Id).ToArray();
        var appointments = await db.Appointments.AsNoTracking().Where(a => !locationId.HasValue || a.LocationId == locationId).OrderBy(a => a.StartsAt).ToListAsync(ct);
        var invoices = await db.Invoices.AsNoTracking().Where(i => !locationId.HasValue || i.LocationId == locationId).OrderByDescending(i => i.IssuedAt).ToListAsync(ct);
        var records = await db.MedicalRecords.AsNoTracking().Where(r => ids.Contains(r.PatientId)).OrderByDescending(r => r.CreatedAt).ToListAsync(ct);
        var consents = await db.ConsentForms.AsNoTracking().Where(c => ids.Contains(c.PatientId)).OrderByDescending(c => c.CreatedAt).ToListAsync(ct);
        var messages = await db.Messages.AsNoTracking().Where(m => ids.Contains(m.PatientId)).OrderByDescending(m => m.CreatedAt).ToListAsync(ct);
        return Results.Ok(new
        {
            locations,
            patients,
            appointments,
            invoices,
            records,
            consents,
            messages,
            providers = Providers,
            demo = config["Database:Provider"] == "InMemory",
            generatedAt = DateTime.UtcNow
        });
    }

    private static async Task<IResult> AddPatient(CreatePatient request, ClinicDbContext db, CancellationToken ct)
    {
        if (RequestValidation.Errors(request) is { } errors) return Results.ValidationProblem(errors);
        if (request.DateOfBirth > DateOnly.FromDateTime(DateTime.UtcNow) || request.DateOfBirth < new DateOnly(1900, 1, 1)) return Invalid("Enter a valid date of birth.");
        if (!await db.Locations.AnyAsync(l => l.Id == request.LocationId, ct)) return Invalid("Select a valid location.");
        var email = request.Email.Trim().ToLowerInvariant();
        if (await db.Patients.AnyAsync(p => p.Email == email, ct)) return Results.Conflict(new { detail = "A patient with this email already exists." });
        var patient = new Patient { Name = request.Name.Trim(), Email = email, Phone = request.Phone.Trim(), DateOfBirth = request.DateOfBirth, LocationId = request.LocationId, BloodGroup = request.BloodGroup ?? "Unknown", Allergies = request.Allergies ?? "None recorded" };
        db.Patients.Add(patient);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException) { return Results.Conflict(new { detail = "Could not save this patient. The email may already be registered." }); }
        return Results.Created($"/api/patients/{patient.Id}", patient);
    }

    private static async Task<IResult> AddAppointment(CreateAppointment request, ClinicDbContext db, CancellationToken ct)
    {
        if (RequestValidation.Errors(request) is { } errors) return Results.ValidationProblem(errors);
        if (!AppointmentTypes.Contains(request.Type) || !Providers.Contains(request.Provider)) return Invalid("Select a valid appointment type and provider.");
        if (request.StartsAt.Kind != DateTimeKind.Utc || request.StartsAt < DateTime.UtcNow.AddMinutes(-5)) return Invalid("Choose a future appointment with a UTC time.");
        if (!await db.Patients.AnyAsync(p => p.Id == request.PatientId, ct) || !await db.Locations.AnyAsync(l => l.Id == request.LocationId, ct)) return Invalid("Select a valid patient and location.");
        await SchedulingLock.WaitAsync(ct);
        try
        {
            await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
            if (transaction is not null)
                foreach (var key in new[] { $"provider:{request.Provider}", $"patient:{request.PatientId}" }.Order(StringComparer.Ordinal))
                    await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))", ct);
            var end = request.StartsAt.AddMinutes(request.DurationMinutes);
            var conflict = await db.Appointments.AnyAsync(a => a.Status != "Cancelled" &&
                (a.Provider == request.Provider || a.PatientId == request.PatientId) && a.StartsAt < end && a.StartsAt.AddMinutes(a.DurationMinutes) > request.StartsAt, ct);
            if (conflict) return Results.Conflict(new { detail = "This provider or patient already has an appointment at that time. Choose another slot." });
            var appointment = new Appointment { PatientId = request.PatientId, LocationId = request.LocationId, Provider = request.Provider, Type = request.Type, StartsAt = request.StartsAt, DurationMinutes = request.DurationMinutes, Reason = request.Reason?.Trim() ?? "" };
            db.Appointments.Add(appointment);
            await db.SaveChangesAsync(ct);
            if (transaction is not null) await transaction.CommitAsync(ct);
            return Results.Created($"/api/appointments/{appointment.Id}", appointment);
        }
        finally { SchedulingLock.Release(); }
    }

    private static async Task<IResult> UpdateAppointmentStatus(Guid id, UpdateAppointment request, ClinicDbContext db, CancellationToken ct)
    {
        var appointment = await db.Appointments.FindAsync([id], ct);
        if (appointment is null) return Results.NotFound();
        var transitions = new Dictionary<string, string[]>
        {
            ["Pending"] = ["Confirmed", "Cancelled"],
            ["Confirmed"] = ["Checked in", "In progress", "Cancelled"],
            ["Checked in"] = ["In progress", "Cancelled"],
            ["In progress"] = ["Completed", "Cancelled"],
            ["Completed"] = [],
            ["Cancelled"] = []
        };
        if (!transitions.TryGetValue(appointment.Status, out var allowed) || !allowed.Contains(request.Status)) return Invalid("This appointment status transition is not allowed.");
        appointment.Status = request.Status;
        await db.SaveChangesAsync(ct);
        return Results.Ok(appointment);
    }

    private static async Task<IResult> AddRecord(CreateRecord request, ClinicDbContext db, CancellationToken ct)
    {
        if (RequestValidation.Errors(request) is { } errors) return Results.ValidationProblem(errors);
        if (!await db.Patients.AnyAsync(p => p.Id == request.PatientId, ct)) return Invalid("Select a valid patient.");
        if (!Providers.Contains(request.Provider)) return Invalid("Select a valid provider.");
        var record = new MedicalRecord { PatientId = request.PatientId, Diagnosis = request.Diagnosis.Trim(), Notes = request.Notes.Trim(), Provider = request.Provider, Prescription = request.Prescription ?? "", FollowUp = request.FollowUp ?? "" };
        db.MedicalRecords.Add(record);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/records/{record.Id}", record);
    }

    private static async Task<IResult> AddInvoice(CreateInvoice request, ClinicDbContext db, CancellationToken ct)
    {
        if (RequestValidation.Errors(request) is { } errors) return Results.ValidationProblem(errors);
        if (!await db.Patients.AnyAsync(p => p.Id == request.PatientId, ct) || !await db.Locations.AnyAsync(l => l.Id == request.LocationId, ct)) return Invalid("Select a valid patient and location.");
        if (request.DueAt.Kind != DateTimeKind.Utc || request.DueAt.Date < DateTime.UtcNow.Date) return Invalid("Choose a due date today or later.");
        var invoice = new Invoice { PatientId = request.PatientId, LocationId = request.LocationId, Number = $"INV-{DateTime.UtcNow:yyyy}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}", Description = request.Description, Amount = decimal.Round(request.Amount, 2), DueAt = request.DueAt };
        db.Invoices.Add(invoice);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/invoices/{invoice.Id}", invoice);
    }

    private static async Task<IResult> MarkInvoicePaid(Guid id, ClinicDbContext db, CancellationToken ct)
    {
        var invoice = await db.Invoices.FindAsync([id], ct);
        if (invoice is null) return Results.NotFound();
        invoice.Status = "Paid";
        invoice.PaidAt ??= DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Results.Ok(invoice);
    }

    private static async Task<IResult> AddConsent(CreateConsent request, ClinicDbContext db, CancellationToken ct)
    {
        if (RequestValidation.Errors(request) is { } errors) return Results.ValidationProblem(errors);
        if (!await db.Patients.AnyAsync(p => p.Id == request.PatientId, ct)) return Invalid("Select a valid patient.");
        var consent = new ConsentForm { PatientId = request.PatientId, Title = request.Title, Body = request.Body };
        db.ConsentForms.Add(consent);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/consents/{consent.Id}", consent);
    }

    private static async Task<IResult> SignConsentForm(Guid id, SignConsent request, ClinicDbContext db, CancellationToken ct)
    {
        if (RequestValidation.Errors(request) is { } errors) return Results.ValidationProblem(errors);
        if (!request.Accepted) return Invalid("The patient must explicitly accept the consent terms.");
        await ConsentSigningLock.WaitAsync(ct);
        try
        {
            var consent = await db.ConsentForms.FindAsync([id], ct);
            if (consent is null) return Results.NotFound();
            if (consent.SignedAt.HasValue) return Results.Conflict(new { detail = "This form has already been signed and cannot be changed." });
            var signature = request.Signature.Trim();
            var signedAt = DateTime.UtcNow;
            if (db.Database.IsRelational())
            {
                // A conditional update also protects against another API instance signing at the same time.
                var updated = await db.ConsentForms.Where(c => c.Id == id && c.SignedAt == null)
                    .ExecuteUpdateAsync(update => update.SetProperty(c => c.Signature, signature)
                        .SetProperty(c => c.SignedAt, signedAt), ct);
                if (updated == 0) return Results.Conflict(new { detail = "This form has already been signed and cannot be changed." });
                await db.Entry(consent).ReloadAsync(ct);
            }
            else
            {
                consent.Signature = signature;
                consent.SignedAt = signedAt;
                await db.SaveChangesAsync(ct);
            }
            return Results.Ok(consent);
        }
        finally { ConsentSigningLock.Release(); }
    }

    private static async Task<IResult> AddMessage(CreateMessage request, ClinicDbContext db, CancellationToken ct)
    {
        if (RequestValidation.Errors(request) is { } errors) return Results.ValidationProblem(errors);
        if (!await db.Patients.AnyAsync(p => p.Id == request.PatientId, ct)) return Invalid("Select a valid patient.");
        var message = new PatientMessage { PatientId = request.PatientId, Subject = request.Subject.Trim(), Body = request.Body.Trim(), IsRead = true };
        db.Messages.Add(message);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/messages/{message.Id}", message);
    }

    private static async Task<IResult> MarkMessageRead(Guid id, ClinicDbContext db, CancellationToken ct)
    {
        var message = await db.Messages.FindAsync([id], ct);
        if (message is null) return Results.NotFound();
        message.IsRead = true;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> RegisterTrial(CreateTrial request, ClinicDbContext db, CancellationToken ct)
    {
        if (RequestValidation.Errors(request) is { } errors) return Results.ValidationProblem(errors);
        var email = request.Email.Trim().ToLowerInvariant();
        if (await db.Trials.AnyAsync(t => t.Email == email, ct)) return Results.Conflict(new { detail = "A trial has already been registered for this email." });
        var trial = new TrialRegistration { ClinicName = request.ClinicName.Trim(), Email = email };
        db.Trials.Add(trial);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException) { return Results.Conflict(new { detail = "This email already has a trial registration." }); }
        return Results.Created($"/api/trials/{trial.Id}", new { trial.Id, trial.ClinicName, trial.EndsAt, message = "Your 14-day trial is registered. No payment details required." });
    }

    private static async Task<IResult> AddLocation(CreateLocation request, ClinicDbContext db, CancellationToken ct)
    {
        if (RequestValidation.Errors(request) is { } errors) return Results.ValidationProblem(errors);
        var location = new Location { Id = Guid.NewGuid(), Name = request.Name.Trim(), Address = request.Address.Trim() };
        db.Locations.Add(location);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/locations/{location.Id}", location);
    }

    private static IResult Invalid(string detail) => Results.Problem(detail, statusCode: 400, title: "Please check your information");
}

using Careflow.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Careflow.Api.Data;

public sealed class ClinicDbContext(DbContextOptions<ClinicDbContext> options) : DbContext(options)
{
    public DbSet<Location> Locations => Set<Location>();
    public DbSet<Patient> Patients => Set<Patient>();
    public DbSet<Appointment> Appointments => Set<Appointment>();
    public DbSet<MedicalRecord> MedicalRecords => Set<MedicalRecord>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<ConsentForm> ConsentForms => Set<ConsentForm>();
    public DbSet<PatientMessage> Messages => Set<PatientMessage>();
    public DbSet<TrialRegistration> Trials => Set<TrialRegistration>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<Patient>().HasIndex(p => p.Email).IsUnique();
        model.Entity<Patient>().Property(p => p.Name).HasMaxLength(120);
        model.Entity<Patient>().Property(p => p.Email).HasMaxLength(254);
        model.Entity<Patient>().HasOne<Location>().WithMany().HasForeignKey(p => p.LocationId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Appointment>().HasIndex(a => new { a.Provider, a.StartsAt });
        model.Entity<Appointment>().HasOne<Location>().WithMany().HasForeignKey(a => a.LocationId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Invoice>().Property(i => i.Amount).HasPrecision(12, 2);
        model.Entity<Invoice>().HasIndex(i => i.Number).IsUnique();
        model.Entity<TrialRegistration>().HasIndex(t => t.Email).IsUnique();
        foreach (var entity in model.Model.GetEntityTypes())
            foreach (var foreignKey in entity.GetForeignKeys())
                foreignKey.DeleteBehavior = DeleteBehavior.Restrict;
    }
}

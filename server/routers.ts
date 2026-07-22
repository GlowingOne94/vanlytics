import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, orgProcedure, adminProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { generateToken, hashToken } from "./_core/tokens";
import { sendInviteEmail } from "./_core/email";
import * as db from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    // signup/login are plain Express routes (server/auth.ts), not tRPC procedures,
    // since they need to set cookies before any user session exists.
  }),

  // ============ ORGANIZATIONS (membership, switching, invites) ============
  organizations: router({
    // Every company the logged-in user belongs to — powers the org switcher.
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserMemberships(ctx.user.id);
    }),
    members: orgProcedure.query(async ({ ctx }) => {
      return db.getOrganizationMembers(ctx.organizationId);
    }),
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(200) }))
      .mutation(async ({ input, ctx }) => {
        const slugify = (name: string) =>
          name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "org";

        const baseSlug = slugify(input.name);
        let slug = baseSlug;
        let attempt = 1;
        while (await db.getOrganizationBySlug(slug)) {
          attempt += 1;
          slug = `${baseSlug}-${attempt}`;
        }

        const organization = await db.createOrganization({ name: input.name, slug });
        await db.createOrganizationMember({
          organizationId: organization.id,
          userId: ctx.user.id,
          role: "admin",
        });

        return { organizationId: organization.id, name: organization.name } as const;
      }),
    pendingInvites: adminProcedure.query(async ({ ctx }) => {
      return db.getPendingInvites(ctx.organizationId);
    }),
    revokeInvite: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const invite = await db.getInviteById(input.id);
        if (!invite || invite.organizationId !== ctx.organizationId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found." });
        }
        await db.deleteInvite(input.id);
        return { success: true } as const;
      }),
    invite: adminProcedure
      .input(z.object({
        email: z.string().email(),
        role: z.enum(["user", "admin"]).default("user"),
      }))
      .mutation(async ({ input, ctx }) => {
        const org = await db.getOrganizationById(ctx.organizationId);
        const token = generateToken();
        const tokenHash = hashToken(token);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        await db.createInvite({
          organizationId: ctx.organizationId,
          email: input.email,
          role: input.role,
          tokenHash,
          invitedByUserId: ctx.user.id,
          expiresAt,
        });

        await sendInviteEmail({
          to: input.email,
          orgName: org?.name ?? "your team",
          token,
        });

        return { success: true } as const;
      }),
    // Accept an invite while already logged in (as the invited email).
    acceptInvite: protectedProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const invite = await db.getInviteByTokenHash(hashToken(input.token));
        if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This invite is invalid or has expired." });
        }
        if (invite.email.toLowerCase() !== ctx.user.email.toLowerCase()) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This invite was sent to a different email address." });
        }
        const existing = await db.getMembership(ctx.user.id, invite.organizationId);
        if (!existing) {
          await db.createOrganizationMember({
            organizationId: invite.organizationId,
            userId: ctx.user.id,
            role: invite.role,
          });
        }
        await db.markInviteAccepted(invite.id);
        return { success: true, organizationId: invite.organizationId } as const;
      }),
  }),

  // Public lookup so the accept-invite page can show who/what the invite is
  // for before the visitor has logged in.
  invites: router({
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const invite = await db.getInviteByTokenHash(hashToken(input.token));
        if (!invite) return null;
        const org = await db.getOrganizationById(invite.organizationId);
        return {
          email: invite.email,
          organizationName: org?.name ?? "Unknown",
          expired: invite.expiresAt.getTime() < Date.now(),
          accepted: Boolean(invite.acceptedAt),
        };
      }),
  }),

  // ============ VEHICLES ============
  vehicles: router({
    list: orgProcedure.query(async ({ ctx }) => {
      return db.getVehicles(ctx.organizationId);
    }),
    getById: orgProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        return db.getVehicleById(ctx.organizationId, input.id);
      }),
    create: orgProcedure
      .input(z.object({
        vanNumber: z.string().min(1),
        vin: z.string().min(1).max(17),
        licensePlate: z.string().optional(),
        year: z.number().min(1990).max(2030),
        make: z.string().default("Ford"),
        model: z.string().default("Transit Ambulette"),
        mileage: z.number().default(0),
        engine: z.string().optional(),
        transmission: z.string().optional(),
        assignedDriver: z.string().optional(),
        status: z.enum(["active", "down", "awaiting_parts", "at_shop", "retired"]).default("active"),
        healthScore: z.enum(["green", "yellow", "red"]).default("green"),
        insuranceIssued: z.number().optional(),
        insuranceExpiry: z.number().optional(),
        registrationIssued: z.number().optional(),
        registrationExpiry: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createVehicle(ctx.organizationId, input);
      }),
    update: orgProcedure
      .input(z.object({
        id: z.number(),
        vanNumber: z.string().optional(),
        vin: z.string().optional(),
        licensePlate: z.string().nullable().optional(),
        year: z.number().optional(),
        make: z.string().optional(),
        model: z.string().optional(),
        mileage: z.number().optional(),
        engine: z.string().nullable().optional(),
        transmission: z.string().nullable().optional(),
        assignedDriver: z.string().nullable().optional(),
        status: z.enum(["active", "down", "awaiting_parts", "at_shop", "retired"]).optional(),
        healthScore: z.enum(["green", "yellow", "red"]).optional(),
        photoUrl: z.string().nullable().optional(),
        photoKey: z.string().nullable().optional(),
        insuranceIssued: z.number().nullable().optional(),
        insuranceExpiry: z.number().nullable().optional(),
        registrationIssued: z.number().nullable().optional(),
        registrationExpiry: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateVehicle(ctx.organizationId, id, data);
        return { success: true };
      }),
    delete: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteVehicle(ctx.organizationId, input.id);
        return { success: true };
      }),
    uploadPhoto: orgProcedure
      .input(z.object({
        vehicleId: z.number(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const key = `vehicles/${input.vehicleId}/${input.fileName}`;
        const { url, key: fileKey } = await storagePut(key, buffer, input.contentType);
        await db.updateVehicle(ctx.organizationId, input.vehicleId, { photoUrl: url, photoKey: fileKey });
        return { url, key: fileKey };
      }),
  }),

  // ============ REPAIRS ============
  repairs: router({
    list: orgProcedure
      .input(z.object({ vehicleId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        return db.getRepairs(ctx.organizationId, input?.vehicleId);
      }),
    getById: orgProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        return db.getRepairById(ctx.organizationId, input.id);
      }),
    create: orgProcedure
      .input(z.object({
        vehicleId: z.number(),
        shopId: z.number().nullable().optional(),
        date: z.number(),
        mileage: z.number().optional(),
        mechanic: z.string().optional(),
        complaint: z.string().optional(),
        diagnosis: z.string().optional(),
        partsReplaced: z.array(z.string()).optional(),
        partsCost: z.string().default("0"),
        laborCost: z.string().default("0"),
        tax: z.string().default("0"),
        totalCost: z.string().default("0"),
        warrantyMonths: z.number().optional(),
        warrantyExpiry: z.number().optional(),
        oldPartReturned: z.enum(["yes", "no"]).optional(),
        repairSuccessful: z.enum(["yes", "no"]).optional(),
        category: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const orgId = ctx.organizationId;
        const result = await db.createRepair(orgId, input);
        // Check for repeat repair warnings and auto-generate alerts
        const warnings = await db.checkRepeatRepairs(orgId, input.vehicleId, input.category || undefined, input.partsReplaced || undefined);
        for (const w of warnings) {
          const vehicles = await db.getVehicles(orgId);
          const vehicle = vehicles.find(v => v.id === input.vehicleId);
          await db.createAlert(orgId, {
            vehicleId: input.vehicleId,
            type: "repeat_repair",
            title: `Repeat repair warning - Van ${vehicle?.vanNumber || input.vehicleId}`,
            message: w.message,
            severity: w.type === "warranty_active" ? "critical" : "warning",
          });
        }
        return { ...result, warnings };
      }),
    update: orgProcedure
      .input(z.object({
        id: z.number(),
        vehicleId: z.number().optional(),
        shopId: z.number().nullable().optional(),
        date: z.number().optional(),
        mileage: z.number().optional(),
        mechanic: z.string().optional(),
        complaint: z.string().optional(),
        diagnosis: z.string().optional(),
        partsReplaced: z.array(z.string()).optional(),
        partsCost: z.string().optional(),
        laborCost: z.string().optional(),
        tax: z.string().optional(),
        totalCost: z.string().optional(),
        warrantyMonths: z.number().optional(),
        warrantyExpiry: z.number().optional(),
        oldPartReturned: z.enum(["yes", "no"]).optional(),
        repairSuccessful: z.enum(["yes", "no"]).optional(),
        category: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateRepair(ctx.organizationId, id, data);
        return { success: true };
      }),
    delete: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteRepair(ctx.organizationId, input.id);
        return { success: true };
      }),
    getDocuments: orgProcedure
      .input(z.object({ repairId: z.number() }))
      .query(async ({ input, ctx }) => {
        return db.getRepairDocuments(ctx.organizationId, input.repairId);
      }),
    uploadDocument: orgProcedure
      .input(z.object({
        repairId: z.number(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const key = `repairs/${input.repairId}/${input.fileName}`;
        const { url, key: fileKey } = await storagePut(key, buffer, input.contentType);
        await db.createRepairDocument(ctx.organizationId, {
          repairId: input.repairId,
          fileName: input.fileName,
          fileUrl: url,
          fileKey: fileKey,
          fileType: input.contentType,
        });
        return { url, key: fileKey };
      }),
    deleteDocument: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteRepairDocument(ctx.organizationId, input.id);
        return { success: true };
      }),
  }),

  // ============ SHOPS ============
  shops: router({
    list: orgProcedure.query(async ({ ctx }) => {
      return db.getShops(ctx.organizationId);
    }),
    getById: orgProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        return db.getShopById(ctx.organizationId, input.id);
      }),
    create: orgProcedure
      .input(z.object({
        name: z.string().min(1),
        phone: z.string().optional(),
        address: z.string().optional(),
        contactPerson: z.string().optional(),
        specialties: z.array(z.string()).optional(),
        averageLaborRate: z.string().optional(),
        recommendation: z.enum(["yes", "no", "maybe"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createShop(ctx.organizationId, input);
      }),
    update: orgProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        phone: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        contactPerson: z.string().nullable().optional(),
        specialties: z.array(z.string()).optional(),
        averageLaborRate: z.string().nullable().optional(),
        reliabilityScore: z.string().nullable().optional(),
        recommendation: z.enum(["yes", "no", "maybe"]).nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateShop(ctx.organizationId, id, data);
        return { success: true };
      }),
    delete: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteShop(ctx.organizationId, input.id);
        return { success: true };
      }),
  }),

  // ============ MAINTENANCE ============
  maintenance: router({
    getServices: orgProcedure.query(async ({ ctx }) => {
      return db.getMaintenanceServices(ctx.organizationId);
    }),
    getRecords: orgProcedure
      .input(z.object({ vehicleId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        return db.getMaintenanceRecords(ctx.organizationId, input?.vehicleId);
      }),
    createRecord: orgProcedure
      .input(z.object({
        vehicleId: z.number(),
        serviceId: z.number(),
        completedAt: z.number(),
        mileageAtService: z.number().optional(),
        nextDueMileage: z.number().optional(),
        nextDueDate: z.number().optional(),
        shopId: z.number().optional(),
        cost: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createMaintenanceRecord(ctx.organizationId, input);
      }),
    deleteRecord: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteMaintenanceRecord(ctx.organizationId, input.id);
        return { success: true };
      }),
    getUpcoming: orgProcedure.query(async ({ ctx }) => {
      return db.getUpcomingMaintenance(ctx.organizationId);
    }),
    // Most recent completed record per vehicle+service — the basis for
    // computing what's overdue, due soon, or never logged, on the client.
    latestByVehicleAndService: orgProcedure.query(async ({ ctx }) => {
      return db.getLatestMaintenanceByVehicleAndService(ctx.organizationId);
    }),
  }),

  // ============ DOT INSPECTIONS ============
  dotInspections: router({
    list: orgProcedure
      .input(z.object({ vehicleId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        return db.getDotInspections(ctx.organizationId, input?.vehicleId);
      }),
    latestByVehicle: orgProcedure.query(async ({ ctx }) => {
      return db.getLatestDotInspectionByVehicle(ctx.organizationId);
    }),
    create: orgProcedure
      .input(z.object({
        vehicleId: z.number(),
        inspectionDate: z.number(),
        mileageAtInspection: z.number().optional(),
        inspector: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // DOT inspections are valid for 6 months from the inspection date.
        const expiryDate = new Date(input.inspectionDate);
        expiryDate.setMonth(expiryDate.getMonth() + 6);
        return db.createDotInspection(ctx.organizationId, {
          vehicleId: input.vehicleId,
          inspectionDate: input.inspectionDate,
          expiryDate: expiryDate.getTime(),
          mileageAtInspection: input.mileageAtInspection,
          inspector: input.inspector,
          notes: input.notes,
        });
      }),
    delete: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteDotInspection(ctx.organizationId, input.id);
        return { success: true } as const;
      }),
    update: orgProcedure
      .input(z.object({
        id: z.number(),
        inspectionDate: z.number().optional(),
        mileageAtInspection: z.number().nullable().optional(),
        inspector: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, inspectionDate, ...rest } = input;
        const data: Record<string, unknown> = { ...rest };

        if (inspectionDate !== undefined) {
          data.inspectionDate = inspectionDate;
          const expiryDate = new Date(inspectionDate);
          expiryDate.setMonth(expiryDate.getMonth() + 6);
          data.expiryDate = expiryDate.getTime();
        }

        await db.updateDotInspection(ctx.organizationId, id, data);
        return { success: true } as const;
      }),
  }),

  // ============ DRIVERS ============
  drivers: router({
    list: orgProcedure.query(async ({ ctx }) => {
      return db.getDrivers(ctx.organizationId);
    }),
    create: orgProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        licenseNumber: z.string().optional(),
        phone: z.string().optional(),
        status: z.enum(["active", "inactive"]).default("active"),
        ssnLast4: z.string().max(4).optional(),
        dateOfBirth: z.number().optional(),
        cdlExpiry: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createDriver(ctx.organizationId, input);
      }),
    update: orgProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        licenseNumber: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        status: z.enum(["active", "inactive"]).optional(),
        ssnLast4: z.string().max(4).nullable().optional(),
        dateOfBirth: z.number().nullable().optional(),
        cdlExpiry: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateDriver(ctx.organizationId, id, data);
        return { success: true } as const;
      }),
    delete: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteDriver(ctx.organizationId, input.id);
        return { success: true } as const;
      }),
  }),

  // ============ DRIVER MEDICAL CERTS ============
  driverMedicalCerts: router({
    list: orgProcedure
      .input(z.object({ driverId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        return db.getDriverMedicalCerts(ctx.organizationId, input?.driverId);
      }),
    latestByDriver: orgProcedure.query(async ({ ctx }) => {
      return db.getLatestMedicalCertByDriver(ctx.organizationId);
    }),
    create: orgProcedure
      .input(z.object({
        driverId: z.number(),
        examDate: z.number(),
        expiryDate: z.number(),
        renewalYears: z.enum(["1", "2"]).default("2"),
        examiner: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createDriverMedicalCert(ctx.organizationId, input);
      }),
    update: orgProcedure
      .input(z.object({
        id: z.number(),
        examDate: z.number().optional(),
        expiryDate: z.number().optional(),
        renewalYears: z.enum(["1", "2"]).optional(),
        examiner: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateDriverMedicalCert(ctx.organizationId, id, data);
        return { success: true } as const;
      }),
    delete: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteDriverMedicalCert(ctx.organizationId, input.id);
        return { success: true } as const;
      }),
  }),

  // ============ DRIVER ABSTRACTS (MVR reviews) ============
  driverAbstracts: router({
    list: orgProcedure
      .input(z.object({ driverId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        return db.getDriverAbstracts(ctx.organizationId, input?.driverId);
      }),
    latestByDriver: orgProcedure.query(async ({ ctx }) => {
      return db.getLatestAbstractByDriver(ctx.organizationId);
    }),
    create: orgProcedure
      .input(z.object({
        driverId: z.number(),
        pulledDate: z.number(),
        nextDueDate: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createDriverAbstract(ctx.organizationId, input);
      }),
    update: orgProcedure
      .input(z.object({
        id: z.number(),
        pulledDate: z.number().optional(),
        nextDueDate: z.number().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateDriverAbstract(ctx.organizationId, id, data);
        return { success: true } as const;
      }),
    delete: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteDriverAbstract(ctx.organizationId, input.id);
        return { success: true } as const;
      }),
  }),

  // ============ ALERTS ============
  alerts: router({
    list: orgProcedure
      .input(z.object({ unreadOnly: z.boolean().optional(), vehicleId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        return db.getAlerts(ctx.organizationId, input);
      }),
    markRead: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.markAlertRead(ctx.organizationId, input.id);
        return { success: true };
      }),
    dismiss: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.dismissAlert(ctx.organizationId, input.id);
        return { success: true };
      }),
  }),

  // ============ DASHBOARD ============
  dashboard: router({
    stats: orgProcedure.query(async ({ ctx }) => {
      return db.getDashboardStats(ctx.organizationId);
    }),
    upcomingMaintenance: orgProcedure.query(async ({ ctx }) => {
      return db.getUpcomingMaintenance(ctx.organizationId);
    }),
  }),

  // ============ ANALYTICS ============
  analytics: router({
    repairsByDateRange: orgProcedure
      .input(z.object({ startDate: z.number(), endDate: z.number() }))
      .query(async ({ input, ctx }) => {
        return db.getRepairsByDateRange(ctx.organizationId, input.startDate, input.endDate);
      }),
    partsVsLabor: orgProcedure.query(async ({ ctx }) => {
      return db.getPartsVsLaborBreakdown(ctx.organizationId);
    }),
    repairFrequency: orgProcedure
      .input(z.object({ months: z.number().default(12) }).optional())
      .query(async ({ input, ctx }) => {
        return db.getRepairFrequencyTrends(ctx.organizationId, input?.months);
      }),
    costPerMile: orgProcedure.query(async ({ ctx }) => {
      return db.getCostPerMile(ctx.organizationId);
    }),
    averagePricing: orgProcedure.query(async ({ ctx }) => {
      return db.getAverageRepairPricing(ctx.organizationId);
    }),
    shopPerformance: orgProcedure.query(async ({ ctx }) => {
      return db.computeShopPerformance(ctx.organizationId);
    }),
    costByVehicle: orgProcedure.query(async ({ ctx }) => {
      const orgId = ctx.organizationId;
      const allRepairs = await db.getRepairs(orgId);
      const allVehicles = await db.getVehicles(orgId);
      const costMap: Record<number, { vanNumber: string; total: number; count: number }> = {};
      for (const r of allRepairs) {
        if (!costMap[r.vehicleId]) {
          const v = allVehicles.find(v => v.id === r.vehicleId);
          costMap[r.vehicleId] = { vanNumber: v?.vanNumber || "Unknown", total: 0, count: 0 };
        }
        costMap[r.vehicleId].total += parseFloat(r.totalCost || "0");
        costMap[r.vehicleId].count++;
      }
      return Object.entries(costMap).map(([id, data]) => ({
        vehicleId: parseInt(id),
        ...data,
      })).sort((a, b) => b.total - a.total);
    }),
    costByCategory: orgProcedure.query(async ({ ctx }) => {
      const allRepairs = await db.getRepairs(ctx.organizationId);
      const categoryMap: Record<string, { total: number; count: number }> = {};
      for (const r of allRepairs) {
        const cat = r.category || "Uncategorized";
        if (!categoryMap[cat]) categoryMap[cat] = { total: 0, count: 0 };
        categoryMap[cat].total += parseFloat(r.totalCost || "0");
        categoryMap[cat].count++;
      }
      return Object.entries(categoryMap).map(([category, data]) => ({
        category,
        ...data,
      })).sort((a, b) => b.total - a.total);
    }),
    monthlySpending: orgProcedure
      .input(z.object({ months: z.number().default(12) }))
      .query(async ({ input, ctx }) => {
        const now = Date.now();
        const startDate = now - input.months * 30 * 24 * 60 * 60 * 1000;
        const allRepairs = await db.getRepairsByDateRange(ctx.organizationId, startDate, now);
        const monthlyMap: Record<string, number> = {};
        for (const r of allRepairs) {
          const date = new Date(r.date);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          monthlyMap[key] = (monthlyMap[key] || 0) + parseFloat(r.totalCost || "0");
        }
        return Object.entries(monthlyMap).map(([month, total]) => ({
          month,
          total: Math.round(total * 100) / 100,
        })).sort((a, b) => a.month.localeCompare(b.month));
      }),
    shopComparison: orgProcedure.query(async ({ ctx }) => {
      const orgId = ctx.organizationId;
      const allRepairs = await db.getRepairs(orgId);
      const allShops = await db.getShops(orgId);
      const shopMap: Record<number, { name: string; totalCost: number; count: number; successful: number }> = {};
      for (const r of allRepairs) {
        if (r.shopId) {
          if (!shopMap[r.shopId]) {
            const shop = allShops.find(s => s.id === r.shopId);
            shopMap[r.shopId] = { name: shop?.name || "Unknown", totalCost: 0, count: 0, successful: 0 };
          }
          shopMap[r.shopId].totalCost += parseFloat(r.totalCost || "0");
          shopMap[r.shopId].count++;
          if (r.repairSuccessful === "yes") shopMap[r.shopId].successful++;
        }
      }
      return Object.entries(shopMap).map(([id, data]) => ({
        shopId: parseInt(id),
        ...data,
        avgCost: data.count > 0 ? Math.round((data.totalCost / data.count) * 100) / 100 : 0,
        successRate: data.count > 0 ? Math.round((data.successful / data.count) * 100) : 0,
      })).sort((a, b) => b.successRate - a.successRate);
    }),
  }),

  // ============ ALERTS GENERATION ============
  alertGeneration: router({
    run: orgProcedure.mutation(async ({ ctx }) => {
      return db.generateAlerts(ctx.organizationId);
    }),
  }),

  // ============ SEARCH ============
  search: router({
    global: orgProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        return db.globalSearch(ctx.organizationId, input.query);
      }),
  }),

  // ============ AI FLEET ADVISOR ============
  advisor: router({
    chat: orgProcedure
      .input(z.object({
        messages: z.array(z.object({
          role: z.enum(["user", "assistant", "system"]),
          content: z.string(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const orgId = ctx.organizationId;
        // Gather fleet context for the AI
        const [vehicles, repairs, shops, alerts] = await Promise.all([
          db.getVehicles(orgId),
          db.getRepairs(orgId),
          db.getShops(orgId),
          db.getAlerts(orgId, { unreadOnly: true }),
        ]);

        const fleetContext = `
You are the Vanlytics AI Advisor for a commercial Ford Transit Ambulette fleet.

CURRENT FLEET STATUS:
- Total vehicles: ${vehicles.length}
- Active: ${vehicles.filter(v => v.status === "active").length}
- Down: ${vehicles.filter(v => v.status === "down").length}
- At Shop: ${vehicles.filter(v => v.status === "at_shop").length}
- Awaiting Parts: ${vehicles.filter(v => v.status === "awaiting_parts").length}

RECENT REPAIRS (last 20):
${repairs.slice(0, 20).map(r => {
  const v = vehicles.find(v => v.id === r.vehicleId);
  return `- Van ${v?.vanNumber || "?"}: ${r.complaint || r.category || "Repair"} - $${r.totalCost} on ${new Date(r.date).toLocaleDateString()}`;
}).join("\n")}

SHOPS:
${shops.map(s => `- ${s.name}: ${s.recommendation || "no rating"} recommendation, avg labor $${s.averageLaborRate || "N/A"}/hr`).join("\n")}

ACTIVE ALERTS: ${alerts.length}
${alerts.slice(0, 10).map(a => `- [${a.severity}] ${a.title}`).join("\n")}

Based on this fleet data, provide helpful, specific advice about fleet health, repair recommendations, cost optimization, and maintenance strategies. Be direct and actionable. If you notice patterns (repeat repairs, high costs, warranty issues), call them out.`;

        const systemMessage = { role: "system" as const, content: fleetContext };
        const allMessages = [systemMessage, ...input.messages];

        const response = await invokeLLM({
          messages: allMessages,
        });

        const rawContent = response.choices[0]?.message?.content;
        let content = "I'm unable to provide advice at this time.";
        if (typeof rawContent === "string") {
          content = rawContent;
        } else if (Array.isArray(rawContent)) {
          content = rawContent.filter(c => c.type === "text").map(c => (c as any).text).join("");
        }
        return { content };
      }),
  }),
});

export type AppRouter = typeof appRouter;

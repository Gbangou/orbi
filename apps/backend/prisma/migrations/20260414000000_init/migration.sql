-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('RIDER', 'DRIVER', 'ADMIN', 'SUPPORT', 'OPS');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'GOOGLE', 'APPLE');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('OFFLINE', 'ONLINE', 'BUSY', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DriverOnboardingReviewStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "DriverDocumentType" AS ENUM ('IDENTITY_DOCUMENT', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'INSURANCE_PROOF', 'SELFIE_VERIFICATION');

-- CreateEnum
CREATE TYPE "DriverDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('MOTORCYCLE', 'CAR');

-- CreateEnum
CREATE TYPE "ServiceTier" AS ENUM ('MOTO_STANDARD', 'MOTO_PLUS', 'CAR_STANDARD', 'CAR_COMFORT', 'CAR_XL');

-- CreateEnum
CREATE TYPE "RideRequestStatus" AS ENUM ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVING', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('MATCHED', 'DRIVER_ARRIVING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CancelledBy" AS ENUM ('RIDER', 'DRIVER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT', 'DEBIT', 'ADJUSTMENT', 'PAYOUT', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('FLUTTERWAVE', 'CINETPAY');

-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('MOBILE_MONEY', 'CARD', 'WALLET');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('INITIATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'SMS', 'EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone_number" TEXT,
    "password_hash" TEXT,
    "full_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "provider" "AuthProvider" NOT NULL DEFAULT 'EMAIL',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emergency_phone" TEXT,
    "preferred_tier" "ServiceTier",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "license_number" TEXT,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "status" "DriverStatus" NOT NULL DEFAULT 'OFFLINE',
    "current_latitude" DECIMAL(10,7),
    "current_longitude" DECIMAL(10,7),
    "service_radius_km" DECIMAL(6,2),
    "average_rating" DECIMAL(3,2),
    "completed_trips_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_documents" (
    "id" TEXT NOT NULL,
    "driver_profile_id" TEXT NOT NULL,
    "type" "DriverDocumentType" NOT NULL,
    "status" "DriverDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "metadata" JSONB,
    "reviewed_by_user_id" TEXT,

    CONSTRAINT "driver_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_onboarding_reviews" (
    "id" TEXT NOT NULL,
    "driver_profile_id" TEXT NOT NULL,
    "status" "DriverOnboardingReviewStatus" NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "notes_internal" TEXT,
    "decision_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_onboarding_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "plate_number" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "year" INTEGER,
    "type" "VehicleType" NOT NULL,
    "tier" "ServiceTier" NOT NULL,
    "seats" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_places" (
    "id" TEXT NOT NULL,
    "rider_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_requests" (
    "id" TEXT NOT NULL,
    "rider_id" TEXT NOT NULL,
    "status" "RideRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "requested_vehicle_type" "VehicleType" NOT NULL,
    "requested_service_tier" "ServiceTier",
    "pickup_address" TEXT NOT NULL,
    "pickup_latitude" DECIMAL(10,7),
    "pickup_longitude" DECIMAL(10,7),
    "destination_address" TEXT NOT NULL,
    "destination_latitude" DECIMAL(10,7),
    "destination_longitude" DECIMAL(10,7),
    "estimated_fare" DECIMAL(10,2),
    "estimated_distance_km" DECIMAL(10,2),
    "estimated_duration_minutes" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ride_request_id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "channel" "PaymentChannel" NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'INITIATED',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "mobile_money_network" TEXT,
    "transaction_ref" TEXT NOT NULL,
    "provider_reference" TEXT,
    "customer_phone_number" TEXT,
    "redirect_url" TEXT,
    "provider_metadata" JSONB,
    "reconciliation_payload" JSONB,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "ride_request_id" TEXT NOT NULL,
    "rider_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'MATCHED',
    "cancelled_by" "CancelledBy",
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "pickup_address" TEXT NOT NULL,
    "destination_address" TEXT NOT NULL,
    "actual_fare" DECIMAL(10,2),
    "distance_km" DECIMAL(10,2),
    "duration_minutes" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_events" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicle_type" "VehicleType" NOT NULL,
    "service_tier" "ServiceTier" NOT NULL,
    "base_fare" DECIMAL(10,2) NOT NULL,
    "per_km_rate" DECIMAL(10,2) NOT NULL,
    "per_minute_rate" DECIMAL(10,2) NOT NULL,
    "booking_fee" DECIMAL(10,2) NOT NULL,
    "minimum_fare" DECIMAL(10,2) NOT NULL,
    "surge_multiplier" DECIMAL(5,2),
    "priority" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "rider_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_revoked_at_expires_at_idx" ON "user_sessions"("user_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "rider_profiles_user_id_key" ON "rider_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_profiles_user_id_key" ON "driver_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_profiles_license_number_key" ON "driver_profiles"("license_number");

-- CreateIndex
CREATE INDEX "driver_profiles_status_verification_status_idx" ON "driver_profiles"("status", "verification_status");

-- CreateIndex
CREATE UNIQUE INDEX "driver_documents_storage_key_key" ON "driver_documents"("storage_key");

-- CreateIndex
CREATE INDEX "driver_documents_driver_profile_id_type_status_uploaded_at_idx" ON "driver_documents"("driver_profile_id", "type", "status", "uploaded_at");

-- CreateIndex
CREATE INDEX "driver_documents_status_expires_at_idx" ON "driver_documents"("status", "expires_at");

-- CreateIndex
CREATE INDEX "driver_onboarding_reviews_driver_profile_id_created_at_idx" ON "driver_onboarding_reviews"("driver_profile_id", "created_at");

-- CreateIndex
CREATE INDEX "driver_onboarding_reviews_status_created_at_idx" ON "driver_onboarding_reviews"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_number_key" ON "vehicles"("plate_number");

-- CreateIndex
CREATE INDEX "vehicles_driver_id_is_active_type_tier_idx" ON "vehicles"("driver_id", "is_active", "type", "tier");

-- CreateIndex
CREATE INDEX "saved_places_rider_id_created_at_idx" ON "saved_places"("rider_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "saved_places_rider_id_label_key" ON "saved_places"("rider_id", "label");

-- CreateIndex
CREATE INDEX "ride_requests_rider_id_status_created_at_idx" ON "ride_requests"("rider_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ride_requests_status_requested_vehicle_type_requested_servi_idx" ON "ride_requests"("status", "requested_vehicle_type", "requested_service_tier", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_transaction_ref_key" ON "payment_attempts"("transaction_ref");

-- CreateIndex
CREATE INDEX "payment_attempts_user_id_status_created_at_idx" ON "payment_attempts"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "payment_attempts_ride_request_id_created_at_idx" ON "payment_attempts"("ride_request_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_attempts_provider_status_created_at_idx" ON "payment_attempts"("provider", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "trips_ride_request_id_key" ON "trips"("ride_request_id");

-- CreateIndex
CREATE INDEX "trips_rider_id_status_created_at_idx" ON "trips"("rider_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "trips_driver_id_status_created_at_idx" ON "trips"("driver_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "trips_vehicle_id_created_at_idx" ON "trips"("vehicle_id", "created_at");

-- CreateIndex
CREATE INDEX "trip_events_trip_id_created_at_idx" ON "trip_events"("trip_id", "created_at");

-- CreateIndex
CREATE INDEX "pricing_rules_is_active_vehicle_type_service_tier_priority_idx" ON "pricing_rules"("is_active", "vehicle_type", "service_tier", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_rules_vehicle_type_service_tier_name_key" ON "pricing_rules"("vehicle_type", "service_tier", "name");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_currency_key" ON "wallets"("user_id", "currency");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "ratings_trip_id_created_at_idx" ON "ratings"("trip_id", "created_at");

-- CreateIndex
CREATE INDEX "ratings_driver_id_score_created_at_idx" ON "ratings"("driver_id", "score", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_user_id_status_priority_idx" ON "support_tickets"("user_id", "status", "priority");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_profiles" ADD CONSTRAINT "rider_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_profile_id_fkey" FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_onboarding_reviews" ADD CONSTRAINT "driver_onboarding_reviews_driver_profile_id_fkey" FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_onboarding_reviews" ADD CONSTRAINT "driver_onboarding_reviews_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_ride_request_id_fkey" FOREIGN KEY ("ride_request_id") REFERENCES "ride_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_ride_request_id_fkey" FOREIGN KEY ("ride_request_id") REFERENCES "ride_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

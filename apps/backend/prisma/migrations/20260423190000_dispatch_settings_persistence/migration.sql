CREATE TABLE "system_settings" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updated_by_user_id" TEXT,
  "updated_by_name" TEXT,
  "updated_by_role" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

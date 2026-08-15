CREATE TYPE "public"."derivative_kind" AS ENUM('email', 'social_post', 'training_handout');--> statement-breakpoint
CREATE TYPE "public"."detail_level" AS ENUM('short', 'standard', 'detailed');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('created', 'uploading', 'uploaded', 'transcribing', 'analyzing', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."output_type" AS ENUM('professional_recap', 'executive_brief', 'training_notes', 'meeting_recap', 'podcast_recap');--> statement-breakpoint
CREATE TYPE "public"."retention_policy" AS ENUM('delete_after_processing', 'hours_24', 'days_7', 'days_30', 'keep');--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"output_type" "output_type" DEFAULT 'professional_recap' NOT NULL,
	"detail" "detail_level" DEFAULT 'standard' NOT NULL,
	"is_current" integer DEFAULT 1 NOT NULL,
	"model" text,
	"executive_summary" jsonb,
	"key_takeaways" jsonb,
	"most_important" jsonb,
	"recommended_actions" jsonb,
	"quotes" jsonb,
	"topics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "derivatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"kind" "derivative_kind" NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"original_filename" text NOT NULL,
	"media_type" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" bigint NOT NULL,
	"duration_ms" integer,
	"status" "job_status" DEFAULT 'created' NOT NULL,
	"failed_stage" text,
	"error_message" text,
	"storage_url" text,
	"storage_pathname" text,
	"retention" "retention_policy" DEFAULT 'delete_after_processing' NOT NULL,
	"media_deleted_at" timestamp with time zone,
	"transcription_provider" text,
	"transcription_job_id" text,
	"language" text,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"transcription_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "speakers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"provider_label" text NOT NULL,
	"display_name" text
);
--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transcript_id" uuid NOT NULL,
	"speaker_id" uuid,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"text" text NOT NULL,
	"sequence" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"cleaned_transcript" text,
	"language" text,
	"word_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivatives" ADD CONSTRAINT "derivatives_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speakers" ADD CONSTRAINT "speakers_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_speaker_id_speakers_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."speakers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyses_job_idx" ON "analyses" USING btree ("job_id","is_current");--> statement-breakpoint
CREATE UNIQUE INDEX "derivatives_job_kind_idx" ON "derivatives" USING btree ("job_id","kind");--> statement-breakpoint
CREATE INDEX "jobs_created_at_idx" ON "jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_transcription_job_id_idx" ON "jobs" USING btree ("transcription_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "speakers_job_label_idx" ON "speakers" USING btree ("job_id","provider_label");--> statement-breakpoint
CREATE INDEX "segments_transcript_sequence_idx" ON "transcript_segments" USING btree ("transcript_id","sequence");
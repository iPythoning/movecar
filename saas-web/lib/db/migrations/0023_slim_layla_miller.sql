CREATE TABLE "movecar_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_id" uuid NOT NULL,
	"requester_ip" varchar(45),
	"requester_location" jsonb,
	"message" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"channels_sent" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"one_time_token_hash" varchar(64),
	"owner_reply" text,
	"owner_location" jsonb,
	"replied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movecar_push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" varchar(30) NOT NULL,
	"token_value" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movecar_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"short_code" varchar(10) NOT NULL,
	"plate_number" text,
	"vehicle_model" text,
	"template_id" varchar(50) DEFAULT 'classic' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movecar_tags_short_code_unique" UNIQUE("short_code")
);
--> statement-breakpoint
ALTER TABLE "movecar_notifications" ADD CONSTRAINT "movecar_notifications_tag_id_movecar_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."movecar_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movecar_push_tokens" ADD CONSTRAINT "movecar_push_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movecar_tags" ADD CONSTRAINT "movecar_tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_movecar_notif_tag_id" ON "movecar_notifications" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_movecar_notif_ip_created" ON "movecar_notifications" USING btree ("requester_ip","created_at");--> statement-breakpoint
CREATE INDEX "idx_movecar_push_tokens_user_channel" ON "movecar_push_tokens" USING btree ("user_id","channel");--> statement-breakpoint
CREATE INDEX "idx_movecar_tags_user_id" ON "movecar_tags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_movecar_tags_short_code" ON "movecar_tags" USING btree ("short_code");
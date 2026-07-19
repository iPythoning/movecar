-- ==============================================================================
-- MoveCar SaaS - Supabase (PostgreSQL) Database Schema
-- ==============================================================================

-- 1. Users Table: 存储注册车主信息
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    last_login TIMESTAMP WITH TIME ZONE,
    push_token VARCHAR(255), -- 关联的 App 推送 Token (FCM/APNs)
    phone_number VARCHAR(50), -- 用于接收 SMS 或 WhatsApp
    telegram_chat_id VARCHAR(100), -- 用于接收 Telegram Bot 消息
    notification_preferences JSONB DEFAULT '{"email": true, "push": true, "sms": false, "whatsapp": false, "telegram": false}'::jsonb, -- 用户全渠道通知开关
    plan_type VARCHAR(50) DEFAULT 'free', -- free, monthly, lifetime
    stripe_customer_id VARCHAR(255) UNIQUE,
    subscription_status VARCHAR(50) DEFAULT 'inactive' -- active, canceled, past_due
);

-- 2. Vehicles / Tags Table: 每个车主可以有多个挪车码
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- 这是二维码中的 UUID (如 movecar.com/t/abc-123)
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plate_number VARCHAR(50), -- 可选的车牌号备注
    vehicle_model VARCHAR(100), -- 可选的车辆型号备注
    is_active BOOLEAN DEFAULT true, -- 如果订阅过期，可以被设为 false
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    settings JSONB DEFAULT '{}'::jsonb -- 存储特定设置（如：是否延迟推送、自定义提示语）
);

-- 3. Notifications Table: 记录每一次扫码和通知事件 (用于统计和反滥用)
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    requester_ip VARCHAR(45),
    requester_location JSONB, -- 存储经纬度 {lat, lng}
    message TEXT, -- 路人留下的快捷消息
    status VARCHAR(50) DEFAULT 'pending', -- pending, sent, delivered, owner_replied
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    owner_reply TEXT, -- 车主的快捷回复（如："I'm coming"）
    replied_at TIMESTAMP WITH TIME ZONE
);

-- ==============================================================================
-- Row Level Security (RLS) Policies
-- ==============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own data
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);

-- Users can only manage their own tags
CREATE POLICY "Users can manage own tags" ON tags FOR ALL USING (auth.uid() = user_id);

-- Users can only view notifications for their own tags
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT 
USING (tag_id IN (SELECT id FROM tags WHERE user_id = auth.uid()));

-- ==============================================================================
-- Indexes for Performance
-- ==============================================================================
CREATE INDEX idx_tags_user_id ON tags(user_id);
CREATE INDEX idx_notifications_tag_id ON notifications(tag_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

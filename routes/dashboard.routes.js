/**
 * Bootstrap dashboard — 1x auth + 1 response (profile + stats + messages)
 * Mengurangi 3 round-trip API + 3x getUser menjadi 1.
 */
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { cleanText } = require('../utils/validators');

// GET /api/dashboard/bootstrap
router.get('/bootstrap', requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const offset = (page - 1) * limit;
    const search = cleanText(req.query.search, 200);
    const filter = req.query.filter;
    const userId = req.user.id;

    // Profile + counts in parallel
    const profilePromise = supabaseAdmin
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_premium, theme, message_count, view_count')
      .eq('id', userId)
      .single();

    const unreadPromise = supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .eq('is_read', false);

    let messagesQuery = supabaseAdmin
      .from('messages')
      .select('id, sender_name, content, image_url, is_read, is_pinned, is_favorite, is_archived, created_at', {
        count: 'exact'
      })
      .eq('recipient_id', userId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filter === 'pinned') messagesQuery = messagesQuery.eq('is_pinned', true);
    else if (filter === 'favorite') messagesQuery = messagesQuery.eq('is_favorite', true);
    else if (filter === 'archived') messagesQuery = messagesQuery.eq('is_archived', true);
    else messagesQuery = messagesQuery.eq('is_archived', false);

    if (search) messagesQuery = messagesQuery.ilike('content', `%${search}%`);

    const [profileRes, unreadRes, messagesRes] = await Promise.all([
      profilePromise,
      unreadPromise,
      messagesQuery
    ]);

    const profile = profileRes.data;
    const messages = messagesRes.data || [];
    const total = messagesRes.count || 0;

    // Premium stats only if premium (parallel counts)
    let premiumStats = null;
    if (profile?.is_premium) {
      const [pinned, favorite, archived] = await Promise.all([
        supabaseAdmin.from('messages').select('*', { count: 'exact', head: true }).eq('recipient_id', userId).eq('is_pinned', true),
        supabaseAdmin.from('messages').select('*', { count: 'exact', head: true }).eq('recipient_id', userId).eq('is_favorite', true),
        supabaseAdmin.from('messages').select('*', { count: 'exact', head: true }).eq('recipient_id', userId).eq('is_archived', true)
      ]);
      premiumStats = {
        pinnedMessages: pinned.count || 0,
        favoriteMessages: favorite.count || 0,
        archivedMessages: archived.count || 0
      };
    }

    // Batch mark unread on this page as read (1 query, bukan N)
    const unreadIds = messages.filter((m) => !m.is_read).map((m) => m.id);
    if (unreadIds.length > 0) {
      // fire-and-forget — jangan tunda response
      supabaseAdmin
        .from('messages')
        .update({ is_read: true })
        .in('id', unreadIds)
        .eq('recipient_id', userId)
        .then(() => {})
        .catch(() => {});
    }

    res.json({
      success: true,
      data: {
        profile: profile || null,
        stats: {
          totalMessages: profile?.message_count || 0,
          totalViews: profile?.view_count || 0,
          unreadMessages: unreadRes.count || 0,
          isPremium: !!profile?.is_premium,
          premiumStats
        },
        messages,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit))
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

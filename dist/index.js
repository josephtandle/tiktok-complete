#!/usr/bin/env node
/**
 * TikTok Complete MCP Server
 * Full TikTok capabilities: video download, user analytics, trending, search, video stats, creator tools.
 *
 * Environment variables:
 *   TIKTOK_API_KEY  - RapidAPI key for TikTok API access
 *   PORT            - HTTP port (default: 8080)
 */
const express = require('express');
const fetch = require('node-fetch');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
// ---------- Config ----------
const PORT = parseInt(process.env.PORT || '8080', 10);
const TIKTOK_API_KEY = process.env.TIKTOK_API_KEY || '';
const TT_VIDEO_HOST = 'tiktok-full-video-info-without-watermark.p.rapidapi.com';
const TT_USER_HOST = 'tiktok-scraper7.p.rapidapi.com';
const TT_TREND_HOST = 'tiktok-scraper7.p.rapidapi.com';
// ---------- API Helpers ----------
async function rapidFetch(host, path, params = {}) {
    if (!TIKTOK_API_KEY) {
        throw new Error('TIKTOK_API_KEY environment variable is not set. Get a RapidAPI key at rapidapi.com.');
    }
    const url = new URL(`https://${host}${path}`);
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null)
            url.searchParams.set(k, String(v));
    }
    const res = await fetch(url.toString(), {
        headers: {
            'X-RapidAPI-Key': TIKTOK_API_KEY,
            'X-RapidAPI-Host': host
        }
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`API error ${res.status}: ${body || res.statusText}`);
    }
    return res.json();
}
async function videoApiFetch(tiktokUrl) {
    const url = new URL(`https://${TT_VIDEO_HOST}/`);
    url.searchParams.set('url', tiktokUrl);
    if (!TIKTOK_API_KEY) {
        throw new Error('TIKTOK_API_KEY environment variable is not set.');
    }
    const res = await fetch(url.toString(), {
        headers: {
            'X-RapidAPI-Key': TIKTOK_API_KEY,
            'X-RapidAPI-Host': TT_VIDEO_HOST
        }
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`TikTok Video API error ${res.status}: ${body || res.statusText}`);
    }
    return res.json();
}
function formatCount(n) {
    if (n === null || n === undefined)
        return null;
    return Number(n);
}
// ---------- MCP Server ----------
const server = new McpServer({
    name: 'tiktok-complete',
    version: '1.0.0'
});
// ===== CATEGORY 1: Video Download =====
server.tool('download_video_no_watermark', 'Download a TikTok video without watermark. Returns HD video URL ready for download. Example: download_video_no_watermark("https://www.tiktok.com/@user/video/1234567890")', {
    tiktok_url: z.string().url().describe('Full TikTok video URL, e.g. https://www.tiktok.com/@username/video/1234567890')
}, async ({ tiktok_url }) => {
    const data = await videoApiFetch(tiktok_url);
    const hdUrl = data.hdplay || data.play || null;
    if (!hdUrl) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'No video URL found. The video may be private or unavailable.', raw: data }, null, 2) }] };
    }
    const result = {
        download_url: hdUrl,
        watermark_free: true,
        quality: data.hdplay ? 'HD' : 'SD',
        original_url: tiktok_url,
        cover_image: data.cover || data.origin_cover || null,
        title: data.title || null,
        duration_seconds: data.duration || null
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('get_video_info', 'Get full metadata for a TikTok video including stats, author info, and music. Example: get_video_info("https://www.tiktok.com/@charlidamelio/video/1234567890")', {
    tiktok_url: z.string().url().describe('Full TikTok video URL')
}, async ({ tiktok_url }) => {
    const data = await videoApiFetch(tiktok_url);
    const result = {
        title: data.title || null,
        description: data.desc || data.title || null,
        duration_seconds: data.duration || null,
        author: {
            username: data.author?.unique_id || null,
            nickname: data.author?.nickname || null,
            avatar: data.author?.avatar_medium?.url_list?.[0] || data.author?.avatarMedium || null,
            verified: data.author?.verified || false,
            followers: formatCount(data.author?.follower_count)
        },
        stats: {
            views: formatCount(data.play_count || data.stats?.playCount),
            likes: formatCount(data.digg_count || data.stats?.diggCount),
            comments: formatCount(data.comment_count || data.stats?.commentCount),
            shares: formatCount(data.share_count || data.stats?.shareCount)
        },
        music: {
            title: data.music_info?.title || data.music?.title || null,
            author: data.music_info?.author || data.music?.author || null,
            duration: data.music_info?.duration || data.music?.duration || null
        },
        cover_image: data.cover || data.origin_cover || null,
        download_url: data.hdplay || data.play || null,
        created_at: data.create_time ? new Date(data.create_time * 1000).toISOString() : null,
        hashtags: (data.desc || '').match(/#\w+/g) || []
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('get_video_metadata', 'Get raw technical metadata for a TikTok video including all available API fields. Useful for debugging or accessing fields not in get_video_info.', {
    tiktok_url: z.string().url().describe('Full TikTok video URL')
}, async ({ tiktok_url }) => {
    const data = await videoApiFetch(tiktok_url);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});
// ===== CATEGORY 2: User Analytics =====
server.tool('get_user_profile', 'Get a TikTok user\'s profile information including follower count, bio, and verification status. Example: get_user_profile("charlidamelio")', {
    username: z.string().min(1).describe('TikTok username without @ symbol, e.g. "charlidamelio"')
}, async ({ username }) => {
    const data = await rapidFetch(TT_USER_HOST, '/user/info', { unique_id: username });
    const user = data.data?.user || data.userInfo?.user || data;
    const stats = data.data?.stats || data.userInfo?.stats || {};
    const result = {
        username: user.uniqueId || username,
        nickname: user.nickname || null,
        bio: user.signature || null,
        avatar: user.avatarMedium || user.avatarLarger || null,
        verified: user.verified || false,
        private_account: user.privateAccount || false,
        stats: {
            followers: formatCount(stats.followerCount || user.followerCount),
            following: formatCount(stats.followingCount || user.followingCount),
            likes: formatCount(stats.heartCount || stats.diggCount || user.heartCount),
            videos: formatCount(stats.videoCount || user.videoCount)
        },
        region: user.region || null,
        language: user.language || null
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('get_user_videos', 'Get recent videos from a TikTok user\'s profile. Returns video list with stats and download URLs. Example: get_user_videos("khaby.lame", 20)', {
    username: z.string().min(1).describe('TikTok username without @ symbol'),
    count: z.number().int().min(1).max(100).default(20).describe('Number of videos to fetch (1-100, default 20)'),
    cursor: z.string().optional().describe('Pagination cursor from previous response for loading more videos')
}, async ({ username, count, cursor }) => {
    const params = { unique_id: username, count: count };
    if (cursor)
        params.cursor = cursor;
    const data = await rapidFetch(TT_USER_HOST, '/user/posts', params);
    const videos = data.data?.videos || data.itemList || data.items || [];
    const result = {
        username,
        video_count: videos.length,
        has_more: data.data?.hasMore || data.hasMore || false,
        next_cursor: data.data?.cursor || data.cursor || null,
        videos: videos.map(v => ({
            id: v.id || v.video_id || null,
            title: v.title || v.desc || null,
            duration_seconds: v.video?.duration || v.duration || null,
            cover: v.video?.cover || v.cover || null,
            download_url: v.video?.playAddr || v.play || null,
            stats: {
                views: formatCount(v.stats?.playCount || v.play_count),
                likes: formatCount(v.stats?.diggCount || v.digg_count),
                comments: formatCount(v.stats?.commentCount || v.comment_count),
                shares: formatCount(v.stats?.shareCount || v.share_count)
            },
            created_at: v.createTime ? new Date(v.createTime * 1000).toISOString() : null
        }))
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('get_user_followers', 'Get follower list for a TikTok user. Example: get_user_followers("mrbeast", 50)', {
    username: z.string().min(1).describe('TikTok username without @ symbol'),
    count: z.number().int().min(1).max(200).default(50).describe('Number of followers to fetch (1-200, default 50)'),
    min_cursor: z.string().optional().describe('Pagination cursor for next page of followers')
}, async ({ username, count, min_cursor }) => {
    const params = { unique_id: username, count };
    if (min_cursor)
        params.min_cursor = min_cursor;
    const data = await rapidFetch(TT_USER_HOST, '/user/followers', params);
    const followers = data.data?.followers || data.followers || [];
    const result = {
        username,
        fetched_count: followers.length,
        has_more: data.data?.hasMore || data.hasMore || false,
        next_cursor: data.data?.minCursor || data.minCursor || null,
        followers: followers.map(f => ({
            username: f.uniqueId || null,
            nickname: f.nickname || null,
            avatar: f.avatarMedium || null,
            verified: f.verified || false,
            follower_count: formatCount(f.followerCount)
        }))
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('get_user_following', 'Get accounts that a TikTok user is following. Example: get_user_following("addisonre", 50)', {
    username: z.string().min(1).describe('TikTok username without @ symbol'),
    count: z.number().int().min(1).max(200).default(50).describe('Number of following accounts to fetch (1-200, default 50)'),
    min_cursor: z.string().optional().describe('Pagination cursor for next page')
}, async ({ username, count, min_cursor }) => {
    const params = { unique_id: username, count };
    if (min_cursor)
        params.min_cursor = min_cursor;
    const data = await rapidFetch(TT_USER_HOST, '/user/following', params);
    const following = data.data?.following || data.following || [];
    const result = {
        username,
        fetched_count: following.length,
        has_more: data.data?.hasMore || data.hasMore || false,
        next_cursor: data.data?.minCursor || data.minCursor || null,
        following: following.map(f => ({
            username: f.uniqueId || null,
            nickname: f.nickname || null,
            avatar: f.avatarMedium || null,
            verified: f.verified || false,
            follower_count: formatCount(f.followerCount)
        }))
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
// ===== CATEGORY 3: Trending =====
server.tool('get_trending_videos', 'Get currently trending TikTok videos. Returns top videos with engagement stats. Example: get_trending_videos("US", 20)', {
    region: z.string().length(2).default('US').describe('Two-letter country code for regional trends (US, GB, AU, etc.)'),
    count: z.number().int().min(1).max(50).default(20).describe('Number of trending videos (1-50, default 20)')
}, async ({ region, count }) => {
    const data = await rapidFetch(TT_TREND_HOST, '/trending/feed', { region, count });
    const videos = data.data || data.itemList || data.items || [];
    const result = {
        region,
        trending_count: videos.length,
        videos: videos.map((v, i) => ({
            rank: i + 1,
            id: v.id || null,
            title: v.desc || v.title || null,
            author: v.author?.uniqueId || null,
            cover: v.video?.cover || v.cover || null,
            stats: {
                views: formatCount(v.stats?.playCount || v.play_count),
                likes: formatCount(v.stats?.diggCount || v.digg_count),
                comments: formatCount(v.stats?.commentCount || v.comment_count),
                shares: formatCount(v.stats?.shareCount || v.share_count)
            },
            hashtags: (v.desc || '').match(/#\w+/g) || [],
            music: v.music?.title || null
        }))
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('get_trending_hashtags', 'Get currently trending hashtags on TikTok. Example: get_trending_hashtags("US")', {
    region: z.string().length(2).default('US').describe('Two-letter country code (US, GB, CA, AU, etc.)')
}, async ({ region }) => {
    const data = await rapidFetch(TT_TREND_HOST, '/trending/hashtags', { region });
    const tags = data.data || data.hashtags || [];
    const result = {
        region,
        hashtag_count: tags.length,
        hashtags: tags.map((t, i) => ({
            rank: i + 1,
            name: t.name || t.hashtag_name || null,
            video_count: formatCount(t.video_count || t.videoCount),
            view_count: formatCount(t.view_count || t.viewCount),
            description: t.desc || null
        }))
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('get_trending_sounds', 'Get currently trending sounds and music on TikTok. Useful for identifying audio trends for content creation. Example: get_trending_sounds("US")', {
    region: z.string().length(2).default('US').describe('Two-letter country code (US, GB, CA, etc.)')
}, async ({ region }) => {
    const data = await rapidFetch(TT_TREND_HOST, '/trending/music', { region });
    const sounds = data.data || data.music || data.sounds || [];
    const result = {
        region,
        sound_count: sounds.length,
        sounds: sounds.map((s, i) => ({
            rank: i + 1,
            id: s.id || null,
            title: s.title || s.name || null,
            author: s.authorName || s.author || null,
            duration_seconds: s.duration || null,
            usage_count: formatCount(s.usageCount || s.videoCount),
            cover: s.coverMedium || s.cover || null
        }))
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
// ===== CATEGORY 4: Search =====
server.tool('search_videos', 'Search TikTok for videos matching a keyword or phrase. Example: search_videos("morning routine", 20)', {
    query: z.string().min(1).describe('Search query, e.g. "morning routine", "cooking tips", "#fitness"'),
    count: z.number().int().min(1).max(50).default(20).describe('Number of results (1-50, default 20)'),
    cursor: z.string().optional().describe('Pagination cursor for next page of results')
}, async ({ query, count, cursor }) => {
    const params = { keywords: query, count };
    if (cursor)
        params.cursor = cursor;
    const data = await rapidFetch(TT_USER_HOST, '/feed/search', params);
    const videos = data.data?.videos || data.itemList || data.items || [];
    const result = {
        query,
        result_count: videos.length,
        has_more: data.data?.hasMore || data.hasMore || false,
        next_cursor: data.data?.cursor || data.cursor || null,
        videos: videos.map(v => ({
            id: v.id || null,
            title: v.desc || v.title || null,
            author: v.author?.uniqueId || null,
            author_followers: formatCount(v.authorStats?.followerCount),
            cover: v.video?.cover || null,
            stats: {
                views: formatCount(v.stats?.playCount),
                likes: formatCount(v.stats?.diggCount),
                comments: formatCount(v.stats?.commentCount),
                shares: formatCount(v.stats?.shareCount)
            },
            hashtags: (v.desc || '').match(/#\w+/g) || [],
            created_at: v.createTime ? new Date(v.createTime * 1000).toISOString() : null
        }))
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('search_users', 'Search TikTok for users matching a name or keyword. Example: search_users("fitness coach", 20)', {
    query: z.string().min(1).describe('Search query for finding TikTok users, e.g. "fitness coach", "cooking", "tech reviewer"'),
    count: z.number().int().min(1).max(50).default(20).describe('Number of results (1-50, default 20)'),
    cursor: z.string().optional().describe('Pagination cursor for next page')
}, async ({ query, count, cursor }) => {
    const params = { keywords: query, count };
    if (cursor)
        params.cursor = cursor;
    const data = await rapidFetch(TT_USER_HOST, '/search/user', params);
    const users = data.data?.users || data.userList || data.users || [];
    const result = {
        query,
        result_count: users.length,
        has_more: data.data?.hasMore || data.hasMore || false,
        next_cursor: data.data?.cursor || data.cursor || null,
        users: users.map(u => {
            const user = u.user || u;
            const stats = u.stats || {};
            return {
                username: user.uniqueId || null,
                nickname: user.nickname || null,
                bio: user.signature || null,
                avatar: user.avatarMedium || null,
                verified: user.verified || false,
                stats: {
                    followers: formatCount(stats.followerCount || user.followerCount),
                    following: formatCount(stats.followingCount || user.followingCount),
                    videos: formatCount(stats.videoCount || user.videoCount)
                }
            };
        })
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('search_hashtags', 'Search TikTok for hashtags matching a keyword. Find related hashtags for content strategy. Example: search_hashtags("fitness")', {
    query: z.string().min(1).describe('Hashtag search term (with or without #), e.g. "fitness", "cooking", "travel"'),
    count: z.number().int().min(1).max(50).default(20).describe('Number of results (1-50, default 20)')
}, async ({ query, count }) => {
    const cleanQuery = query.replace(/^#/, '');
    const data = await rapidFetch(TT_USER_HOST, '/search/challenge', { keywords: cleanQuery, count });
    const hashtags = data.data?.challenges || data.challengeList || data.hashtags || [];
    const result = {
        query: cleanQuery,
        result_count: hashtags.length,
        hashtags: hashtags.map(h => {
            const ch = h.challengeInfo?.challenge || h.challenge || h;
            const stats = h.challengeInfo?.stats || h.stats || {};
            return {
                name: ch.title || ch.name || null,
                description: ch.desc || null,
                video_count: formatCount(stats.videoCount || ch.videoCount),
                view_count: formatCount(stats.viewCount || ch.viewCount)
            };
        })
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
// ===== CATEGORY 5: Video Stats =====
server.tool('get_video_comments', 'Get comments on a TikTok video. Example: get_video_comments("7123456789012345678", 20)', {
    video_id: z.string().min(1).describe('TikTok video ID (numeric string found in video URL)'),
    count: z.number().int().min(1).max(100).default(20).describe('Number of comments to fetch (1-100, default 20)'),
    cursor: z.string().optional().describe('Pagination cursor for next page of comments')
}, async ({ video_id, count, cursor }) => {
    const params = { video_id, count };
    if (cursor)
        params.cursor = cursor;
    const data = await rapidFetch(TT_USER_HOST, '/video/comments', params);
    const comments = data.data?.comments || data.comments || [];
    const result = {
        video_id,
        comment_count: comments.length,
        total_comments: formatCount(data.data?.total || data.total),
        has_more: data.data?.hasMore || data.hasMore || false,
        next_cursor: data.data?.cursor || data.cursor || null,
        comments: comments.map(c => ({
            id: c.cid || c.id || null,
            text: c.text || null,
            author: c.user?.uniqueId || null,
            likes: formatCount(c.digg_count || c.diggCount),
            replies: formatCount(c.reply_comment_total || c.replyCommentTotal),
            created_at: c.create_time ? new Date(c.create_time * 1000).toISOString() : null
        }))
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('get_video_likes', 'Get users who liked a TikTok video. Example: get_video_likes("7123456789012345678", 50)', {
    video_id: z.string().min(1).describe('TikTok video ID (numeric string from video URL)'),
    count: z.number().int().min(1).max(100).default(50).describe('Number of likers to fetch (1-100, default 50)'),
    cursor: z.string().optional().describe('Pagination cursor for next page')
}, async ({ video_id, count, cursor }) => {
    const params = { video_id, count };
    if (cursor)
        params.cursor = cursor;
    const data = await rapidFetch(TT_USER_HOST, '/video/digg', params);
    const users = data.data?.users || data.users || [];
    const result = {
        video_id,
        fetched_count: users.length,
        has_more: data.data?.hasMore || data.hasMore || false,
        next_cursor: data.data?.cursor || data.cursor || null,
        users: users.map(u => ({
            username: u.uniqueId || null,
            nickname: u.nickname || null,
            verified: u.verified || false,
            follower_count: formatCount(u.followerCount)
        }))
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('get_video_shares', 'Get share count and platform breakdown for a TikTok video by URL. Returns share statistics from video metadata. Example: get_video_shares("https://www.tiktok.com/@user/video/7123456789012345678")', {
    tiktok_url: z.string().url().describe('Full TikTok video URL')
}, async ({ tiktok_url }) => {
    const data = await videoApiFetch(tiktok_url);
    const result = {
        tiktok_url,
        shares: formatCount(data.share_count || data.stats?.shareCount),
        likes: formatCount(data.digg_count || data.stats?.diggCount),
        comments: formatCount(data.comment_count || data.stats?.commentCount),
        views: formatCount(data.play_count || data.stats?.playCount),
        author: data.author?.unique_id || null,
        title: data.title || null,
        note: 'TikTok API does not expose per-platform share breakdown. Total share count provided.'
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
// ===== CATEGORY 6: Creator Tools =====
server.tool('get_creator_analytics', 'Get comprehensive analytics for a TikTok creator including engagement rates, average views, and performance trends. Example: get_creator_analytics("garyvee")', {
    username: z.string().min(1).describe('TikTok username without @ symbol'),
    video_sample_size: z.number().int().min(5).max(50).default(20).describe('Number of recent videos to analyze for stats (5-50, default 20)')
}, async ({ username, video_sample_size }) => {
    // Fetch user profile and recent videos in parallel
    const [profileData, videosData] = await Promise.all([
        rapidFetch(TT_USER_HOST, '/user/info', { unique_id: username }),
        rapidFetch(TT_USER_HOST, '/user/posts', { unique_id: username, count: video_sample_size })
    ]);
    const user = profileData.data?.user || profileData.userInfo?.user || {};
    const stats = profileData.data?.stats || profileData.userInfo?.stats || {};
    const videos = videosData.data?.videos || videosData.itemList || [];
    const followerCount = formatCount(stats.followerCount) || 0;
    const videoStats = videos.map(v => ({
        views: v.stats?.playCount || 0,
        likes: v.stats?.diggCount || 0,
        comments: v.stats?.commentCount || 0,
        shares: v.stats?.shareCount || 0
    }));
    const avgViews = videoStats.length > 0 ? Math.round(videoStats.reduce((s, v) => s + v.views, 0) / videoStats.length) : null;
    const avgLikes = videoStats.length > 0 ? Math.round(videoStats.reduce((s, v) => s + v.likes, 0) / videoStats.length) : null;
    const avgComments = videoStats.length > 0 ? Math.round(videoStats.reduce((s, v) => s + v.comments, 0) / videoStats.length) : null;
    const avgEngagement = followerCount > 0 && avgLikes !== null
        ? parseFloat(((avgLikes + avgComments) / followerCount * 100).toFixed(2))
        : null;
    const topVideos = videos
        .sort((a, b) => (b.stats?.playCount || 0) - (a.stats?.playCount || 0))
        .slice(0, 5)
        .map(v => ({
        title: v.desc || null,
        views: formatCount(v.stats?.playCount),
        likes: formatCount(v.stats?.diggCount),
        cover: v.video?.cover || null,
        created_at: v.createTime ? new Date(v.createTime * 1000).toISOString() : null
    }));
    const result = {
        username,
        profile: {
            nickname: user.nickname || null,
            bio: user.signature || null,
            verified: user.verified || false,
            region: user.region || null
        },
        audience: {
            followers: formatCount(stats.followerCount),
            following: formatCount(stats.followingCount),
            total_likes_received: formatCount(stats.heartCount)
        },
        content_performance: {
            videos_analyzed: videoStats.length,
            avg_views_per_video: avgViews,
            avg_likes_per_video: avgLikes,
            avg_comments_per_video: avgComments,
            engagement_rate_percent: avgEngagement,
            total_videos: formatCount(stats.videoCount)
        },
        top_videos: topVideos
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('get_audience_insights', 'Get audience demographic insights for a TikTok creator based on follower analysis and engagement patterns. Example: get_audience_insights("charlidamelio")', {
    username: z.string().min(1).describe('TikTok username without @ symbol'),
    follower_sample: z.number().int().min(10).max(100).default(50).describe('Number of followers to sample for demographic analysis (10-100, default 50)')
}, async ({ username, follower_sample }) => {
    const [profileData, followersData, videosData] = await Promise.all([
        rapidFetch(TT_USER_HOST, '/user/info', { unique_id: username }),
        rapidFetch(TT_USER_HOST, '/user/followers', { unique_id: username, count: follower_sample }),
        rapidFetch(TT_USER_HOST, '/user/posts', { unique_id: username, count: 20 })
    ]);
    const stats = profileData.data?.stats || profileData.userInfo?.stats || {};
    const followers = followersData.data?.followers || followersData.followers || [];
    const videos = videosData.data?.videos || videosData.itemList || [];
    // Analyze follower verification rates and follower counts of followers
    const verifiedFollowers = followers.filter(f => f.verified).length;
    const followerFollowerCounts = followers.map(f => f.followerCount || 0).filter(c => c > 0);
    const avgFollowerFollowers = followerFollowerCounts.length > 0
        ? Math.round(followerFollowerCounts.reduce((s, c) => s + c, 0) / followerFollowerCounts.length)
        : null;
    // Analyze content themes from video descriptions
    const allDesc = videos.map(v => v.desc || '').join(' ');
    const hashtagMatches = allDesc.match(/#\w+/g) || [];
    const hashtagFreq = {};
    for (const tag of hashtagMatches) {
        hashtagFreq[tag] = (hashtagFreq[tag] || 0) + 1;
    }
    const topHashtags = Object.entries(hashtagFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag, count]) => ({ tag, usage_count: count }));
    const result = {
        username,
        audience_size: formatCount(stats.followerCount),
        follower_sample_analyzed: followers.length,
        audience_quality: {
            verified_followers_in_sample: verifiedFollowers,
            verified_follower_rate_percent: followers.length > 0
                ? parseFloat((verifiedFollowers / followers.length * 100).toFixed(1))
                : null,
            avg_follower_follower_count: avgFollowerFollowers,
            note: 'TikTok API does not expose age/gender/location demographics directly. These are derived metrics.'
        },
        content_themes: {
            top_hashtags: topHashtags,
            videos_analyzed: videos.length
        },
        engagement_quality: {
            total_likes: formatCount(stats.heartCount),
            avg_likes_per_follower: stats.followerCount && stats.heartCount && stats.videoCount
                ? parseFloat((stats.heartCount / stats.followerCount).toFixed(2))
                : null
        }
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
// ---------- Express + Transport ----------
const app = express();
app.use(express.json());
app.get('/health', (req, res) => {
    res.json({ status: 'ok', server: 'tiktok-complete', version: '1.0.0' });
});
app.all('/mcp', async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
    });
    res.on('close', () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
});
app.listen(PORT, () => {
    console.log(`TikTok Complete MCP server running on port ${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
    if (!TIKTOK_API_KEY) {
        console.warn('WARNING: TIKTOK_API_KEY is not set. All tool calls will fail until set.');
    }
});

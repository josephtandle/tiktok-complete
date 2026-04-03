# TikTok Complete MCP Server

Stop manually downloading TikTok videos and digging through analytics. Download videos without watermarks, track trends, and analyze creators — all from your AI assistant.

## Tools

| Tool | Category | Description |
|------|----------|-------------|
| `download_video_no_watermark` | Video Download | Download TikTok video without watermark, returns HD URL |
| `get_video_info` | Video Download | Full metadata: author, stats, music, hashtags |
| `get_video_metadata` | Video Download | Raw API response for advanced use cases |
| `get_user_profile` | User Analytics | Follower count, bio, verification status |
| `get_user_videos` | User Analytics | Recent videos with stats and download URLs |
| `get_user_followers` | User Analytics | Paginated follower list |
| `get_user_following` | User Analytics | Accounts a user follows |
| `get_trending_videos` | Trending | Top trending videos by region |
| `get_trending_hashtags` | Trending | Trending hashtags by region |
| `get_trending_sounds` | Trending | Trending music and sounds |
| `search_videos` | Search | Search videos by keyword |
| `search_users` | Search | Find TikTok creators by name or niche |
| `search_hashtags` | Search | Find related hashtags for content strategy |
| `get_video_comments` | Video Stats | Paginated comments for any video |
| `get_video_likes` | Video Stats | Users who liked a video |
| `get_video_shares` | Video Stats | Share count and engagement stats |
| `get_creator_analytics` | Creator Tools | Engagement rate, avg views, top videos |
| `get_audience_insights` | Creator Tools | Audience quality and content theme analysis |

## Quick Start

1. Get a RapidAPI key at [rapidapi.com](https://rapidapi.com) and subscribe to the TikTok APIs
2. Set your `TIKTOK_API_KEY` environment variable
3. Connect to the MCP server at `http://localhost:8080/mcp`

### Example Prompts

- "Download this TikTok video without watermark: [URL]"
- "What are the trending videos in Australia right now?"
- "Analyze @garyvee's TikTok engagement rate"
- "Find TikTok creators in the fitness niche"
- "What hashtags should I use for cooking content?"

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TIKTOK_API_KEY` | Yes | RapidAPI key for TikTok API access |
| `PORT` | No | HTTP port (default: 8080) |

## APIs Used

- **tiktok-full-video-info-without-watermark** (RapidAPI) — video download and metadata
- **tiktok-scraper7** (RapidAPI) — user profiles, trending, search, comments

---

Built for [Mastermind HQ](https://mastermindshq.business) — AI tools for creators and marketers.

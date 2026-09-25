export const currentUser = {
  id: 1,
  username: "Neo",
  role: "admin",
};

export const sections = [
  {
    id: "fx",
    name: "FX",
    description: "Foreign exchange market discussion",
    hierarchyType: "market",
    segmentation: ["day", "week", "month", "year"],
    instruments: [
      { id: "eurusd", symbol: "EUR/USD", name: "Euro / U.S. Dollar" },
      { id: "gbpusd", symbol: "GBP/USD", name: "British Pound / U.S. Dollar" },
      { id: "usdjpy", symbol: "USD/JPY", name: "U.S. Dollar / Japanese Yen" },
    ],
  },
  {
    id: "equities",
    name: "Equities",
    description: "Stocks and equity-market discussion",
    hierarchyType: "market",
    segmentation: ["day", "week", "month", "year"],
    instruments: [
      { id: "spcx", symbol: "SPCX", name: "SPCX" },
      { id: "aapl", symbol: "AAPL", name: "Apple" },
      { id: "nvda", symbol: "NVDA", name: "NVIDIA" },
    ],
  },
  {
    id: "resources",
    name: "Resources",
    description: "Research, psychology and educational material",
    hierarchyType: "general",
    children: [
      { id: "psychology", name: "Psychology", description: "Mindset, discipline and performance" },
      { id: "research", name: "Research", description: "Methods, papers and market research" },
      { id: "education", name: "Education", description: "Guides and educational resources" },
    ],
  },
];

export const discussions = [
  {
    id: 1,
    section: "FX",
    instrument: "EUR/USD",
    instrumentId: "eurusd",
    segmentType: "DAY",
    segmentStart: "2026-09-25",
    title: "EUR/USD â€” September 25, 2026",
    replies: 24,
    lastActivity: "1m",
    author: "Neo",
  },
  {
    id: 2,
    section: "Equities",
    instrument: "SPCX",
    instrumentId: "spcx",
    segmentType: "DAY",
    segmentStart: "2026-09-25",
    title: "SPCX â€” September 25, 2026",
    replies: 17,
    lastActivity: "3m",
    author: "Alex",
  },
  {
    id: 3,
    section: "FX",
    instrument: "GBP/USD",
    instrumentId: "gbpusd",
    segmentType: "WEEK",
    segmentStart: "2026-09-21",
    title: "GBP/USD â€” Week of September 21, 2026",
    replies: 31,
    lastActivity: "4m",
    author: "Mike",
  },
];

export const latestPosts = [
  {
    id: 1,
    instrument: "EUR/USD",
    segment: "DAY Â· SEP 25",
    author: "Neo",
    time: "1m",
    preview: "Watching this area into the next delivery...",
  },
  {
    id: 2,
    instrument: "GBP/USD",
    segment: "WEEK Â· SEP 21",
    author: "Alex",
    time: "4m",
    preview: "The weekly structure is lining up with...",
  },
  {
    id: 3,
    instrument: "SPCX",
    segment: "DAY Â· SEP 25",
    author: "Mike",
    time: "8m",
    preview: "Interesting reaction off the morning range...",
  },
];

export const chatMessages = [
  { id: 1, user: "Neo", message: "EURUSD looking interesting here.", time: "1m" },
  { id: 2, user: "Alex", message: "Posted my chart in today's thread.", time: "3m" },
  { id: 3, user: "Mike", message: "Watching GBP into the afternoon.", time: "6m" },
];

export const discussionPosts = [
  {
    id: 1,
    author: "Neo",
    role: "ADMIN",
    time: "9:42 AM",
    body: "Watching this area. I want to see how price behaves around the current structure before the next move.",
  },
  {
    id: 2,
    author: "Alex",
    role: "USER",
    time: "10:17 AM",
    body: "Same level I'm watching. The reaction into it is the interesting part for me.",
  },
  {
    id: 3,
    author: "Mike",
    role: "USER",
    time: "10:48 AM",
    body: "Adding this to today's archive so we can compare it with the weekly discussion later.",
  },
];

export const users = [
  { id: 1, username: "Neo", role: "admin", status: "Active", posts: 428 },
  { id: 2, username: "Alex", role: "user", status: "Active", posts: 93 },
  { id: 3, username: "Mike", role: "user", status: "Active", posts: 51 },
];

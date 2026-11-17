export interface AdminConfig {
  ConfigFile: string;
  SiteConfig: {
    SiteName: string;
    Announcement: string;
    SearchDownstreamMaxPage: number;
    SiteInterfaceCacheTime: number;
    DoubanProxyType: string;
    DoubanProxy: string;
    DoubanImageProxyType: string;
    DoubanImageProxy: string;
    BangumiProxy?: string;
    BangumiImageProxy?: string;
    DisableYellowFilter: boolean;
    // 弹幕接口配置
    DanmakuApiBaseUrl?: string;
    // TVBox 接口开关与访问密码
    TVBoxEnabled?: boolean;
    TVBoxPassword?: string;
    // 播放进度自动保存间隔（秒），用于控制播放记录保存频率
    PlaybackSaveInterval?: number;
  };
  UserConfig: {
    AllowRegister: boolean;
    // 注册是否需要邀请码（邀请码由管理员在用户管理里生成）
    InviteCodeRequired?: boolean;
    InviteCodes?: {
      code: string;
      note?: string;
      maxUses: number;
      usedCount: number;
      createdAt: number;
      expiresAt?: number;
      disabled?: boolean;
      usedBy?: { username: string; at: number }[];
    }[];
    Users: {
      username: string;
      role: 'user' | 'admin' | 'owner';
      banned?: boolean;
      group?: string;
      lastOnline?: number;
    }[];
    Groups?: {
      name: string;
      sourceKeys: string[];
    }[];
  };
  SourceConfig: {
    key: string;
    name: string;
    api: string;
    detail?: string;
    from: 'config' | 'custom';
    disabled?: boolean;
  }[];
  CustomCategories: {
    name?: string;
    type: 'movie' | 'tv';
    query: string;
    from: 'config' | 'custom';
    disabled?: boolean;
  }[];
  SubscriptionConfig?: {
    subscriptionUrl?: string;
    autoUpdate?: boolean;
    updateInterval?: number; // seconds
    lastUpdated?: number; // timestamp in seconds
    importMode?: 'overwrite' | 'merge';
  };
}

export interface AdminConfigResult {
  Role: 'owner' | 'admin';
  Config: AdminConfig;
}

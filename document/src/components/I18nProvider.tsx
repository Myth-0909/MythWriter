import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type Lang = "zh" | "en";

const translations = {
  // App
  "app.name": { zh: "ZNWriter", en: "ZNWriter" },
  "app.logoPreview": { zh: "品牌预览", en: "Brand preview" },

  // Sidebar
  "nav.documents": { zh: "文档", en: "Documents" },
  "nav.favorites": { zh: "收藏", en: "Favorites" },
  "nav.trash": { zh: "回收站", en: "Trash" },
  "nav.settings": { zh: "设置", en: "Settings" },
  "nav.darkMode": { zh: "深色模式", en: "Dark Mode" },
  "nav.lightMode": { zh: "浅色模式", en: "Light Mode" },
  "nav.followSystem": { zh: "跟随系统", en: "Follow System" },
  "nav.expand": { zh: "展开菜单", en: "Expand Menu" },
  "nav.collapse": { zh: "收起菜单", en: "Collapse Menu" },
  "nav.brain": { zh: "AI设定脑库", en: "AI Brain Base" },

  // AI Brain / Knowledge Base
  "brain.title": { zh: "AI 设定脑库", en: "AI Brain Memory Base" },
  "brain.subtitle": { zh: "为您的 AI 编写世界观与人设，写作过程中自动关联，拒绝忘设定", en: "Configure worldviews & characters for AI. Dynamically injected during writing to prevent forgetting settings." },
  "brain.searchPlaceholder": { zh: "搜索设定项...", en: "Search setting entries..." },
  "brain.addCard": { zh: "创建设定项", en: "Create Setting Entry" },
  "brain.editCard": { zh: "编辑设定项", en: "Edit Setting Entry" },
  "brain.cardTitle": { zh: "设定项名称", en: "Setting Name" },
  "brain.cardTitlePlaceholder": { zh: "例如：林动、大炎王朝、九元涅槃境", en: "e.g., Lin Dong, Great Yan Empire" },
  "brain.cardCategory": { zh: "设定类别", en: "Category" },
  "brain.cardCategory.character": { zh: "角色人设", en: "Character" },
  "brain.cardCategory.location": { zh: "地理背景", en: "Location" },
  "brain.cardCategory.concept": { zh: "功法/概念", en: "Concept" },
  "brain.cardCategory.other": { zh: "其他设定", en: "Other" },
  "brain.cardDesc": { zh: "设定描述", en: "Description" },
  "brain.cardDescPlaceholder": { zh: "请输入该设定项的详细背景信息，越详细 AI 理解越准确...", en: "Enter detailed background information about this setting..." },
  "brain.cardSaved": { zh: "设定已保存", en: "Setting saved successfully" },
  "brain.cardDeleted": { zh: "设定已删除", en: "Setting deleted successfully" },
  "brain.noCards": { zh: "暂无设定卡，立即创建一个吧！", en: "No setting cards yet. Create one now!" },
  "brain.manageCategories": { zh: "管理类别", en: "Manage Categories" },
  "brain.allCategories": { zh: "全部", en: "All" },
  "brain.noCategories": { zh: "暂无类别，点击下方按钮创建", en: "No categories yet. Click below to create one" },
  "brain.noCategoriesTitle": { zh: "还没有类别", en: "No categories yet" },
  "brain.categoryCount": { zh: "个类别", en: "categories" },
  "brain.categoryDragHint": { zh: "拖拽左侧手柄调整类别排序", en: "Drag the left handle to reorder categories" },
  "brain.categoryOrderHint": { zh: "松手后将保存新的排序", en: "Release to save the new order" },
  "brain.manageCategoriesDesc": { zh: "管理 AI 设定脑库的类别与展示顺序", en: "Manage categories and display order for the AI brain base" },
  "brain.categoryFormDesc": { zh: "创建或编辑设定类别", en: "Create or edit a setting category" },
  "brain.createCategory": { zh: "新建类别", en: "New Category" },
  "brain.editCategory": { zh: "编辑类别", en: "Edit Category" },
  "brain.categoryName": { zh: "类别名称", en: "Category Name" },
  "brain.categoryNamePlaceholder": { zh: "例如：角色、势力、世界观", en: "e.g., Character, Faction, Worldview" },
  "brain.categoryColor": { zh: "标签颜色", en: "Label Color" },
  "brain.deleteCategory": { zh: "确定要删除该类别吗？", en: "Delete this category?" },
  "brain.deleteCategoryDesc": { zh: "删除类别不会删除该类别下的设定项，它们将被归为未分类。", en: "Setting items under this category will not be deleted; they will become uncategorized." },
  "brain.noCategoryHint": { zh: "请先创建类别", en: "Please create a category first" },
  "brain.close": { zh: "关闭", en: "Close" },
  "brain.cancel": { zh: "取消", en: "Cancel" },
  "brain.confirm": { zh: "确定", en: "Confirm" },
  "brain.loadingData": { zh: "加载设定数据中...", en: "Loading setting data..." },
  "brain.createNow": { zh: "立即创建", en: "Create Now" },
  "brain.edit": { zh: "编辑", en: "Edit" },
  "brain.delete": { zh: "删除", en: "Delete" },
  "brain.fillComplete": { zh: "请填写完整的名称和描述信息", en: "Please fill in the complete name and description" },
  "brain.saveFailed": { zh: "保存失败", en: "Save failed" },
  "brain.deleteFailed": { zh: "删除失败", en: "Delete failed" },
  "brain.fetchFailed": { zh: "获取数据失败", en: "Failed to load data" },
  "brain.categorySaveFailed": { zh: "保存类别失败", en: "Failed to save category" },
  "brain.categoryDeleted": { zh: "类别已删除", en: "Category deleted" },
  "brain.categoryDeleteFailed": { zh: "删除类别失败", en: "Failed to delete category" },
  "brain.persistOrderFailed": { zh: "保存排序失败", en: "Failed to save category order" },
  "brain.deleteSettingTitle": { zh: "确定要删除该设定项吗？", en: "Delete this setting?" },
  "brain.deleteSettingDesc": { zh: "该设定项一旦删除，将无法在AI写作时自动匹配背景，且此操作不可撤销。", en: "This setting will no longer be automatically matched during AI writing. This action cannot be undone." },
  
  // Document Groups
  "group.title": { zh: "文档分组", en: "Document Groups" },
  "group.all": { zh: "全部文档", en: "All Documents" },
  "group.ungrouped": { zh: "未分组文档", en: "Ungrouped Documents" },
  "group.newGroup": { zh: "新建分组", en: "New Group" },
  "group.renameGroup": { zh: "重命名分组", en: "Rename Group" },
  "group.deleteGroup": { zh: "删除分组", en: "Delete Group" },
  "group.deleteGroupDesc": { zh: "确定要删除该分组吗？分组内的文档不会被删除，它们将被移至未分组。", en: "Are you sure you want to delete this group? The documents will not be deleted; they will be moved to ungrouped." },
  "group.groupName": { zh: "分组名称", en: "Group Name" },
  "group.groupNamePlaceholder": { zh: "请输入分组名称...", en: "Enter group name..." },
  "group.created": { zh: "分组已创建", en: "Group created successfully" },
  "group.renamed": { zh: "分组已重命名", en: "Group renamed successfully" },
  "group.deleted": { zh: "分组已删除", en: "Group deleted successfully" },
  "group.added": { zh: "已成功移入分组", en: "Successfully moved to group" },
  "group.removed": { zh: "已成功移出分组", en: "Successfully removed from group" },
  "group.moveTo": { zh: "移动到分组", en: "Move to Group" },
  "group.noGroups": { zh: "暂无分组，点击创建", en: "No groups. Click to create" },

  // TopAppBar
  "topbar.language": { zh: "语言", en: "Language" },
  "topbar.zh": { zh: "中文", en: "EN" },
  "topbar.share": { zh: "分享", en: "Share" },
  "topbar.export": { zh: "导出", en: "Export" },
  "topbar.upgrade": { zh: "升级", en: "Upgrade" },
  "topbar.logout": { zh: "退出", en: "Logout" },
  "topbar.gridView": { zh: "网格视图", en: "Grid view" },
  "topbar.listView": { zh: "列表视图", en: "List view" },

  // Common / Actions
  "common.confirm": { zh: "确认", en: "Confirm" },
  "common.cancel": { zh: "取消", en: "Cancel" },
  "common.save": { zh: "保存", en: "Save" },
  "common.delete": { zh: "删除", en: "Delete" },
  "common.saved": { zh: "已保存", en: "Saved" },
  "common.copied": { zh: "已复制", en: "Copied" },
  "common.loading": { zh: "加载中...", en: "Loading..." },

  // Dates
  "date.separator": { zh: " · ", en: " · " },
  "date.justNow": { zh: "刚刚修改", en: "just now" },
  "date.minuteAgo": { zh: "分钟前修改", en: " minute ago" },
  "date.minutesAgo": { zh: "分钟前修改", en: " minutes ago" },
  "date.hourAgo": { zh: "小时前修改", en: " hour ago" },
  "date.hoursAgo": { zh: "小时前修改", en: " hours ago" },
  "date.dayAgo": { zh: "天前修改", en: " day ago" },
  "date.daysAgo": { zh: "天前修改", en: " days ago" },

  // Documents
  "documents.title": { zh: "文档", en: "Documents" },
  "documents.myDocuments": { zh: "我的文档", en: "My Documents" },
  "documents.subtitle": { zh: "管理和组织您的写作项目", en: "Manage and organize your writing projects in one place" },
  "documents.newDocument": { zh: "新建文档", en: "New Document" },
  "documents.import": { zh: "导入", en: "Import" },
  "documents.writersFlow": { zh: "写作流", en: "Writer's Flow" },
  "documents.activity": { zh: "过去一周的写作活动", en: "Your writing activity over the past week" },
  "documents.search": { zh: "搜索文档...", en: "Search documents..." },
  "documents.upgrade": { zh: "升级到 Pro", en: "Upgrade to Pro" },
  "documents.upgradeDesc": { zh: "解锁无限文档存储、协作编辑和 AI 重写工具。", en: "Unlock unlimited document storage, collaborative editing, and AI rewriting tools." },
  "documents.upgradeNow": { zh: "立即升级", en: "Upgrade Now" },
  "chart.words": { zh: "字数", en: "Words" },
  "chart.wordsWritten": { zh: "撰写字数", en: "Words written" },

  // Editor
  "editor.untitled": { zh: "未命名文档", en: "Untitled Document" },
  "editor.placeholder": { zh: "开始写作...", en: "Start writing..." },
  "editor.loadingDocument": { zh: "正在加载文档...", en: "Loading document..." },
  "editor.documentUnavailable": { zh: "文档不可用", en: "Document unavailable" },
  "editor.characters": { zh: "字符", en: "characters" },
  "editor.selected": { zh: "已选中", en: "Selected" },
  "editor.avgChars": { zh: "平均字/词", en: "avg. chars/word" },
  "editor.title": { zh: "标题", en: "Title" },
  "editor.searchDocs": { zh: "搜索文档...", en: "Search documents..." },
  "editor.bold": { zh: "加粗", en: "Bold" },
  "editor.italic": { zh: "斜体", en: "Italic" },
  "editor.underline": { zh: "下划线", en: "Underline" },
  "editor.strikethrough": { zh: "删除线", en: "Strikethrough" },
  "editor.bulletList": { zh: "无序列表", en: "Bullet list" },
  "editor.orderedList": { zh: "有序列表", en: "Numbered list" },
  "editor.saving": { zh: "保存中...", en: "Saving..." },
  "editor.saved": { zh: "已自动保存", en: "Auto-saved" },
  "editor.undo": { zh: "撤销", en: "Undo" },
  "editor.redo": { zh: "重做", en: "Redo" },
  "editor.code": { zh: "行内代码", en: "Inline Code" },
  "editor.codeBlock": { zh: "代码块", en: "Code Block" },
  "editor.highlight": { zh: "高亮", en: "Highlight" },
  "editor.textColor": { zh: "文字颜色", en: "Text Color" },
  "editor.clearColor": { zh: "清除颜色", en: "Clear" },
  "editor.alignLeft": { zh: "左对齐", en: "Align Left" },
  "editor.alignCenter": { zh: "居中", en: "Align Center" },
  "editor.alignRight": { zh: "右对齐", en: "Align Right" },
  "editor.blockquote": { zh: "引用", en: "Blockquote" },
  "editor.horizontalRule": { zh: "分割线", en: "Horizontal Rule" },
  "editor.fontSize": { zh: "字号", en: "Font Size" },
  "editor.lineHeight": { zh: "行高", en: "Line Height" },
  "editor.clearFontSize": { zh: "清除字号", en: "Clear" },
  "editor.clearFormatting": { zh: "清除格式", en: "Clear Formatting" },
  "editor.favorite": { zh: "收藏文档", en: "Favorite" },
  "editor.unfavorite": { zh: "取消收藏", en: "Unfavorite" },
  "editor.noContent": { zh: "没有可导出的内容", en: "No content to export" },
  "editor.exported": { zh: "文档已导出", en: "Document exported" },

  // Editor font sizes
  "editor.fontSize.small": { zh: "小", en: "Small" },
  "editor.fontSize.default": { zh: "默认", en: "Default" },
  "editor.fontSize.medium": { zh: "中", en: "Medium" },
  "editor.fontSize.large": { zh: "大", en: "Large" },
  "editor.fontSize.xlarge": { zh: "特大", en: "X-Large" },

  // Editor colors
  "editor.color.default": { zh: "默认", en: "Default" },
  "editor.color.red": { zh: "红色", en: "Red" },
  "editor.color.orange": { zh: "橙色", en: "Orange" },
  "editor.color.yellow": { zh: "黄色", en: "Yellow" },
  "editor.color.green": { zh: "绿色", en: "Green" },
  "editor.color.blue": { zh: "蓝色", en: "Blue" },
  "editor.color.purple": { zh: "紫色", en: "Purple" },
  "editor.color.magenta": { zh: "紫红", en: "Magenta" },

  // Share Modal
  "share.title": { zh: "导出文档", en: "Export Document" },
  "share.exportDocument": { zh: "导出文档", en: "Export Document" },
  "share.shareLink": { zh: "分享链接", en: "Share Link" },
  "share.copyLink": { zh: "复制链接", en: "Copy Link" },
  "share.cancel": { zh: "取消", en: "Cancel" },
  "share.exportBtn": { zh: "导出", en: "Export" },
  "share.wordDesc": { zh: "可编辑文档格式", en: "Editable document format" },
  "share.mdDesc": { zh: "纯文本带格式", en: "Plain text with formatting" },

  // Login
  "login.signIn": { zh: "登录", en: "Sign In" },
  "login.register": { zh: "注册", en: "Register" },
  "login.welcomeBack": { zh: "欢迎回来", en: "Welcome back" },
  "login.createAccount": { zh: "创建您的账户", en: "Create your account" },
  "login.fullName": { zh: "姓名", en: "Full name" },
  "login.email": { zh: "邮箱地址", en: "Email address" },
  "login.password": { zh: "密码", en: "Password" },
  "login.forgot": { zh: "忘记密码？", en: "Forgot password?" },
  "login.createAccountBtn": { zh: "创建账户", en: "Create Account" },
  "login.orContinue": { zh: "或使用以下方式继续", en: "or continue with" },
  "login.noAccount": { zh: "还没有账户？", en: "Don't have an account?" },
  "login.hasAccount": { zh: "已有账户？", en: "Already have an account?" },

  // Trash Page
  "trash.title": { zh: "回收站", en: "Trash" },
  "trash.subtitle": { zh: "已删除的文档将在 30 天后自动清除", en: "Deleted documents are automatically purged after 30 days" },
  "trash.empty": { zh: "回收站为空", en: "Trash is empty" },
  "trash.emptyDesc": { zh: "删除的文档会出现在这里", en: "Deleted documents will appear here" },
  "trash.restore": { zh: "恢复", en: "Restore" },
  "trash.deleteForever": { zh: "永久删除", en: "Delete forever" },
  "trash.restored": { zh: "文档已恢复", en: "Document restored" },
  "trash.deleted": { zh: "文档已永久删除", en: "Document permanently deleted" },
  "trash.daysLeft": { zh: "天后自动清除", en: "days until auto-purge" },
  "trash.emptyTrash": { zh: "清空回收站", en: "Empty Trash" },
  "trash.confirmDelete": { zh: "此操作不可撤销，文档将被永久删除。", en: "This action cannot be undone. The document will be permanently deleted." },
  "trash.confirmEmpty": { zh: "回收站中的所有文档将被永久删除，此操作不可撤销。", en: "All documents in trash will be permanently deleted. This action cannot be undone." },

  // Settings Page
  "settings.title": { zh: "设置", en: "Settings" },
  "settings.profile": { zh: "个人信息", en: "Personal Info" },
  "settings.appearance": { zh: "外观", en: "Appearance" },
  "settings.language": { zh: "语言偏好", en: "Language Preference" },
  "settings.languageDesc": { zh: "选择界面显示语言", en: "Choose your interface language" },
  "settings.theme": { zh: "主题模式", en: "Theme Mode" },
  "settings.themeDesc": { zh: "切换浅色或深色主题", en: "Switch between light and dark theme" },
  "settings.account": { zh: "账户", en: "Account" },
  "settings.email": { zh: "邮箱地址", en: "Email address" },
  "settings.name": { zh: "昵称", en: "Nickname" },
  "settings.save": { zh: "保存更改", en: "Save changes" },
  "settings.saved": { zh: "设置已保存", en: "Settings saved" },
  "settings.about": { zh: "关于", en: "About" },
  "settings.version": { zh: "版本", en: "Version" },
  "settings.premium": { zh: "Premium 会员", en: "Premium Member" },
  "settings.active": { zh: "已激活", en: "Active" },

  // Document Card / Categories
  "card.edit": { zh: "编辑", en: "Edit" },
  "card.share": { zh: "分享", en: "Share" },
  "card.delete": { zh: "删除", en: "Delete" },
  "card.design": { zh: "设计", en: "Design" },
  "card.journal": { zh: "日记", en: "Journal" },
  "card.planning": { zh: "规划", en: "Planning" },
  "card.research": { zh: "研究", en: "Research" },
  "card.general": { zh: "通用", en: "General" },
  "documents.selectCategory": { zh: "选择文档类型", en: "Select Category" },
  "documents.switchCategory": { zh: "切换类型", en: "Switch Type" },
  "documents.clickToSwitch": { zh: "点击切换文档类型", en: "Click to switch document type" },

  // Day of week (short)
  "day.sun": { zh: "周日", en: "Sun" },
  "day.mon": { zh: "周一", en: "Mon" },
  "day.tue": { zh: "周二", en: "Tue" },
  "day.wed": { zh: "周三", en: "Wed" },
  "day.thu": { zh: "周四", en: "Thu" },
  "day.fri": { zh: "周五", en: "Fri" },
  "day.sat": { zh: "周六", en: "Sat" },

  // Favorites Page
  "favorites.empty": { zh: "暂无收藏文档", en: "No favorites yet" },
  "favorites.emptyDesc": { zh: "点击文档上的星标图标即可添加到此处", en: "Click the star icon on any document to add it here" },
  "favorites.subtitle": { zh: "个已收藏的文档", en: "starred document(s)" },

  // Confirm Modals
  "confirm.logoutTitle": { zh: "退出登录", en: "Logout" },
  "confirm.logoutDesc": { zh: "确定要退出登录吗？未保存的更改将会丢失。", en: "Are you sure you want to log out? Any unsaved changes will be lost." },
  "confirm.deleteTitle": { zh: "删除文档", en: "Delete Document" },
  "confirm.deleteDesc": { zh: "确定要删除此文档吗？您可以在 30 天内从回收站恢复。", en: "Are you sure you want to move this document to trash? You can restore it within 30 days." },

  // Toast messages
  "toast.logoutSuccess": { zh: "退出成功！", en: "Logged out successfully!" },
  "toast.loginSuccess": { zh: "登录成功！", en: "Logged in successfully!" },
  "toast.registerSuccess": { zh: "注册成功！", en: "Registered successfully!" },
  "toast.copySuccess": { zh: "链接已复制！", en: "Link copied!" },
  "toast.themeChanged": { zh: "主题已切换", en: "Theme changed" },
  "toast.langChanged": { zh: "语言已切换", en: "Language switched" },
  "toast.exportSuccess": { zh: "导出成功！", en: "Exported successfully!" },
  "toast.comingSoon": { zh: "功能开发中，敬请期待！", en: "Coming soon!" },
  "toast.favAdded": { zh: "已添加到收藏", en: "Added to favorites" },
  "toast.favRemoved": { zh: "已取消收藏", en: "Removed from favorites" },
  "toast.movedToTrash": { zh: "已移入回收站", en: "moved to trash" },
  "toast.newDocCreated": { zh: "新文档已创建", en: "New document created" },
  "toast.importSuccess": { zh: "文档导入成功", en: "Document imported" },
  "toast.importFailed": { zh: "导入失败，请检查文件格式", en: "Import failed, check file format" },
  "toast.importUnsupported": { zh: "不支持的文件格式", en: "Unsupported file format" },
  "toast.importLegacyWordUnsupported": { zh: "暂不支持 .doc 文件，请另存为 .docx 后导入", en: ".doc files are not supported yet. Please save as .docx and import again" },
  "toast.avatarSuccess": { zh: "头像上传成功", en: "Avatar uploaded" },
  "toast.avatarFailed": { zh: "头像上传失败", en: "Avatar upload failed" },
  "toast.avatarTooBig": { zh: "图片大小不能超过2MB", en: "Image must be under 2MB" },
  "toast.profileFailed": { zh: "获取用户信息失败", en: "Failed to load profile" },
  "toast.saveFailed": { zh: "保存失败", en: "Save failed" },
  "toast.createFailed": { zh: "创建文档失败", en: "Failed to create document" },
  "toast.deleteFailed": { zh: "删除失败", en: "Delete failed" },
  "toast.emptyFailed": { zh: "清空失败", en: "Empty failed" },
  "toast.restoreFailed": { zh: "恢复失败", en: "Restore failed" },

  // Forgot Password
  "forgot.title": { zh: "忘记密码", en: "Forgot Password" },
  "forgot.resetPassword": { zh: "重置密码", en: "Reset Password" },
  "forgot.subtitle": { zh: "输入注册邮箱获取验证码", en: "Enter your email to receive a code" },
  "forgot.resetSubtitle": { zh: "输入验证码和新密码", en: "Enter code and new password" },
  "forgot.emailPlaceholder": { zh: "请输入注册邮箱", en: "Enter your email" },
  "forgot.sendCode": { zh: "获取验证码", en: "Send Code" },
  "forgot.codePlaceholder": { zh: "请输入6位验证码", en: "Enter 6-digit code" },
  "forgot.newPasswordPlaceholder": { zh: "请输入新密码（至少6位）", en: "New password (min 6 chars)" },
  "forgot.resetBtn": { zh: "重置密码", en: "Reset Password" },
  "forgot.backToLogin": { zh: "返回登录", en: "Back to Login" },
  "forgot.successTitle": { zh: "密码重置成功", en: "Password Reset" },
  "forgot.successMessage": { zh: "请使用新密码登录您的账户", en: "Sign in with your new password" },
  "forgot.devNotice": { zh: "开发模式显示，生产环境将通过邮件发送", en: "Dev mode; will be emailed in production" },

  // Settings
  "settings.avatarHint": { zh: "点击相机图标上传头像", en: "Click camera icon to upload" },
  "settings.avatarChangeHint": { zh: "点击相机图标更改头像", en: "Click camera icon to change" },

  // AI BubbleMenu
  "ai.menu.rewrite": { zh: "改写", en: "Rewrite" },
  "ai.menu.expand": { zh: "扩写", en: "Expand" },
  "ai.menu.summarize": { zh: "缩写", en: "Summarize" },
  "ai.menu.translate": { zh: "翻译", en: "Translate" },
  "ai.menu.continue": { zh: "续写", en: "Continue" },
  "ai.menu.tone": { zh: "语气", en: "Tone" },
  "ai.menu.toneFormal": { zh: "正式语气", en: "Formal" },
  "ai.menu.toneCasual": { zh: "轻松语气", en: "Casual" },
  "ai.menu.loading": { zh: "AI 处理中...", en: "AI processing..." },
  "ai.menu.applied": { zh: "已应用", en: "Applied" },
  "ai.menu.failed": { zh: "AI 操作失败", en: "AI operation failed" },
  "ai.menu.emptyResult": { zh: "AI 未返回可用内容", en: "AI returned no usable content" },

  // AI Chat
  "ai.title": { zh: "小麦", en: "XiaoMai" },
  "ai.subtitle": { zh: "内网模型", en: "Intranet Model" },
  "ai.greeting": { zh: "你好，我是小麦", en: "Hi, I'm XiaoMai" },
  "ai.greetingDesc": { zh: "我可以帮你写作、编辑、头脑风暴。试试说「帮我写一篇...」", en: "I can help you write, edit, and brainstorm. Try saying 'Write an article about...'" },
  "ai.placeholder": { zh: "输入消息...", en: "Type a message..." },
  "ai.mentionHint": { zh: "输入 @ 引用文档作为上下文", en: "Type @ to reference a document as context" },
  "ai.referenceContext": { zh: "上下文", en: "Context" },
  "ai.noMatchingDocs": { zh: "没有匹配的文档", en: "No matching documents" },
  "ai.removeReference": { zh: "移除引用", en: "Remove reference" },
  "ai.replying": { zh: "小麦正在回复中...", en: "XiaoMai is replying..." },
  "ai.thinking": { zh: "小麦正在思考...", en: "XiaoMai is thinking..." },
  "ai.action": { zh: "小麦正在行动...", en: "XiaoMai is acting..." },
  "ai.clearHistory": { zh: "清除历史记录", en: "Clear History" },
  "ai.clearConfirmTitle": { zh: "清除历史记录", en: "Clear History" },
  "ai.clearConfirmDesc": { zh: "确定要清除所有对话记录吗？此操作不可撤销。", en: "Are you sure you want to clear all conversations? This cannot be undone." },
  "ai.clearConfirmBtn": { zh: "确定清除", en: "Clear All" },
  "ai.cleared": { zh: "历史记录已清除", en: "History cleared" },
  "ai.clearFailed": { zh: "清除失败", en: "Clear failed" },
  "ai.like": { zh: "点赞", en: "Like" },
  "ai.dislike": { zh: "点踩", en: "Dislike" },
  "ai.feedbackThanks": { zh: "感谢反馈！", en: "Thanks for feedback!" },
  "ai.docCreated": { zh: "已创建文档", en: "Document created" },
  "ai.docCreateFailed": { zh: "文档创建失败", en: "Document creation failed" },
  "ai.docUpdated": { zh: "文档已更新", en: "Document updated" },
  "ai.docUpdateFailed": { zh: "文档更新失败", en: "Document update failed" },
  "ai.docUpdateTargetMissing": { zh: "未找到要更新的文档，请使用 @ 引用目标文档后重试。", en: "Could not find the target document. Reference it with @ and try again." },
  "ai.docUpdateEmpty": { zh: "AI 返回的文档内容为空，已取消更新。", en: "AI returned empty document content; update cancelled." },
  "ai.docActionRunning": { zh: "正在执行文档操作...", en: "Applying document action..." },
  "ai.dislikeInaccurate": { zh: "回复不准确", en: "Inaccurate" },
  "ai.dislikeUnexpected": { zh: "不符合预期", en: "Not as expected" },
  "ai.dislikeIncomplete": { zh: "内容不完整", en: "Incomplete" },
  "ai.dislikeTone": { zh: "语气不当", en: "Wrong tone" },
  "ai.dislikeOther": { zh: "其他", en: "Other" },
  "ai.serviceUnavailable": { zh: "AI 服务不可用", en: "AI service unavailable" },
  "ai.emptyReply": { zh: "AI 未返回可用内容，请稍后重试", en: "AI returned no usable content. Please try again later" },
  "ai.voiceNotSupported": { zh: "当前环境不支持语音识别，请检查麦克风权限", en: "Voice input unavailable, check mic permissions" },
  "ai.recording": { zh: "正在录音...", en: "Recording..." },
  "ai.tapToStop": { zh: "点击停止", en: "Tap to stop" },
  "ai.recognitionSuccess": { zh: "语音识别成功", en: "Voice recognized successfully" },
  "ai.needApiKey": { zh: "请先在设置中配置 API Key 后再使用对话助手", en: "Please configure API Key in Settings first" },

  // API Key
  "apikey.title": { zh: "AI 服务配置", en: "AI Service" },
  "apikey.label": { zh: "API Key", en: "API Key" },
  "apikey.desc": { zh: "可使用公司内网 Base URL、API Key 和模型名称，也支持兼容 OpenAI 的接口", en: "Use the company intranet Base URL, API Key, and model name, or any OpenAI-compatible endpoint" },
  "apikey.baseUrl": { zh: "Base URL", en: "Base URL" },
  "apikey.baseUrlDesc": { zh: "默认使用公司内网模型服务，也可填写兼容 OpenAI Chat Completions 的接口地址", en: "Defaults to the company intranet model service; OpenAI-compatible Chat Completions endpoints are also supported" },
  "apikey.baseUrlPlaceholder": { zh: "http://172.16.76.112:8000/v1", en: "http://172.16.76.112:8000/v1" },
  "apikey.provider": { zh: "模型服务商", en: "Model provider" },
  "apikey.providerIntranet": { zh: "公司内网", en: "Company intranet" },
  "apikey.providerDeepSeek": { zh: "DeepSeek", en: "DeepSeek" },
  "apikey.providerOpenAI": { zh: "OpenAI", en: "OpenAI" },
  "apikey.providerQwen": { zh: "通义千问 Qwen", en: "Qwen" },
  "apikey.providerKimi": { zh: "Kimi", en: "Kimi" },
  "apikey.providerCustom": { zh: "自定义 Base URL", en: "Custom Base URL" },
  "apikey.model": { zh: "模型名称", en: "Model" },
  "apikey.modelDesc": { zh: "默认使用公司内网模型 google/gemma-4-31B-it，可按服务端模型列表调整", en: "Defaults to the intranet model google/gemma-4-31B-it; adjust it to match the server model list" },
  "apikey.modelPlaceholder": { zh: "选择或输入模型名称", en: "Select or enter a model name" },
  "apikey.modelGemma": { zh: "公司内网 Gemma", en: "Company Intranet Gemma" },
  "apikey.fetchModels": { zh: "获取模型", en: "Fetch models" },
  "apikey.fetchingModels": { zh: "获取中", en: "Fetching" },
  "apikey.modelsFetched": { zh: "模型列表已更新", en: "Model list updated" },
  "apikey.noModels": { zh: "未获取到模型列表", en: "No models found" },
  "apikey.fetchModelsFailed": { zh: "获取模型失败，请检查 Base URL 和 API Key", en: "Failed to fetch models. Check Base URL and API Key." },
  "apikey.customBaseUrl": { zh: "自定义地址", en: "Custom URL" },
  "apikey.history": { zh: "历史配置", en: "Saved configurations" },
  "apikey.historyPlaceholder": { zh: "选择之前使用过的配置", en: "Choose a previously used configuration" },
  "apikey.noHistory": { zh: "暂无历史配置", en: "No saved configurations yet" },
  "apikey.historyApplied": { zh: "已切换到历史配置", en: "Configuration applied" },
  "apikey.historyApplyFailed": { zh: "切换历史配置失败", en: "Failed to apply configuration" },
  "apikey.deleteHistory": { zh: "删除历史配置", en: "Delete saved configuration" },
  "apikey.historyDeleted": { zh: "历史配置已删除", en: "Saved configuration deleted" },
  "apikey.historyDeleteFailed": { zh: "删除历史配置失败", en: "Failed to delete saved configuration" },
  "apikey.historyCurrentCannotDelete": { zh: "当前正在使用的配置不能删除", en: "The active configuration cannot be deleted" },
  "apikey.configured": { zh: "已配置", en: "Configured" },
  "apikey.notConfigured": { zh: "未配置，对话助手需要 API Key 才能使用", en: "Not configured. API Key required for AI chat." },
  "apikey.edit": { zh: "编辑", en: "Edit" },
  "apikey.configure": { zh: "配置", en: "Configure" },
  "apikey.cancel": { zh: "取消", en: "Cancel" },
  "apikey.placeholder": { zh: "sk-...", en: "sk-..." },
  "apikey.save": { zh: "保存", en: "Save" },
  "apikey.saved": { zh: "AI 服务配置已保存", en: "AI service settings saved" },
  "apikey.saveFailed": { zh: "保存失败", en: "Save failed" },
  "apikey.change": { zh: "更改", en: "Change" },
  "apikey.verifyPassword": { zh: "请输入登录密码以更改 API Key", en: "Enter your login password to change API Key" },
  "apikey.verifyPasswordDesc": { zh: "为保护您的 API 配置安全，修改前请验证登录密码", en: "Please verify your login password before modifying API settings" },
  "apikey.passwordPlaceholder": { zh: "输入登录密码", en: "Enter password" },
  "apikey.verify": { zh: "验证", en: "Verify" },
  "apikey.wrongPassword": { zh: "密码错误", en: "Wrong password" },
  "apikey.noKeyHint": { zh: "未配置 API Key 将无法使用 AI 小麦助手", en: "AI assistant unavailable without an API Key" },

  // 404
  "notfound.title": { zh: "页面不存在", en: "Page not found" },
  "notfound.desc": { zh: "您访问的地址不存在或已被移除", en: "The page you're looking for doesn't exist or has been moved" },
  "notfound.backHome": { zh: "返回首页", en: "Back to Home" },
} as const;

export type TranslationKey = keyof typeof translations;

interface I18nContextType {
  lang: Lang;
  t: (key: TranslationKey) => string;
  toggleLang: () => void;
}

const I18nContext = createContext<I18nContextType>({
  lang: "zh",
  t: () => "",
  toggleLang: () => {},
});

export function useI18n() {
  return useContext(I18nContext);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const stored = localStorage.getItem("lang");
    if (stored === "zh" || stored === "en") return stored;
    return navigator.language.startsWith("zh") ? "zh" : "en";
  });

  const t = useCallback(
    (key: TranslationKey) => {
      return translations[key]?.[lang] ?? key;
    },
    [lang]
  );

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === "zh" ? "en" : "zh";
      localStorage.setItem("lang", next);
      return next;
    });
  }, []);

  return (
    <I18nContext.Provider value={{ lang, t, toggleLang }}>
      {children}
    </I18nContext.Provider>
  );
}

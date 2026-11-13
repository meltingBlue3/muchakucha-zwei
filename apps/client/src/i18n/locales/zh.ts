/**
 * 中文文案。它是源语言：其他语言的目录按这份的类型声明，缺一条或多一条都过不了类型检查。
 * 顶层的每个键是一个命名空间，对应一块功能。
 */
export const zh = {
  common: {
    cancel: '取消',
    close: '关闭{{title}}',
    genericError: '这次没有完成。请检查网络后重试。',
    hideField: '隐藏{{label}}',
    labelProcessing: '{{label}}，正在处理',
    processing: '正在处理',
    retry: '重试',
    save: '保存',
    showField: '显示{{label}}',
  },
  dates: {
    full: '{{year}}年{{month}}月{{day}}日',
    monthDay: '{{month}}月{{day}}日',
    weekday: '周{{name}}',
    weekdayNames: { sun: '日', mon: '一', tue: '二', wed: '三', thu: '四', fri: '五', sat: '六' },
    withWeekday: '{{date}}周{{name}}',
  },
  navigation: {
    collapseSidebar: '收起侧栏',
    expandSidebar: '展开侧栏',
    family: '家庭',
    main: '家庭主导航',
    pages: {
      today: '今日',
      events: '日历',
      tasks: '任务',
      notes: '笔记',
      assistant: '助手',
      settings: '家庭设置',
      labels: '标签管理',
      'recurrence-rules': '重复安排',
      birthdays: '家人生日',
    },
  },
  auth: {
    logout: {
      action: '退出登录',
      cancelName: '取消退出登录',
      confirm: '确认退出',
      confirmName: '确认退出登录',
      dialogTitle: '退出这台设备？',
      explanation: '只会结束这台设备上的登录，其他设备不会退出。',
      failed: '暂时无法退出。请检查网络后重试。',
      failedTitle: '退出未完成',
    },
  },
  profile: {
    calendar: {
      title: '日历',
      showLunar: '显示农历',
      showLunarDetail: '在日历和今日里显示农历日期、节气和传统节日。',
    },
    deviceOnly: '只影响这台设备。',
    edit: '编辑',
    editNickname: '编辑昵称',
    form: {
      checkNickname: '请检查昵称。',
      loading: '正在加载个人资料',
      loadFailedTitle: '暂时无法加载资料',
      me: '我',
      nicknameLength: '请输入 1–80 个字符的昵称。',
      nicknameRequired: '请输入昵称。',
      nicknameTooLong: '昵称不能超过 80 个字符。',
      nicknameUpdated: '昵称已更新。',
      reload: '重新加载资料',
      saveFailedTitle: '暂时无法保存',
    },
    language: {
      title: '语言',
      system: '跟随系统',
    },
    links: {
      inbox: { label: '收件箱', description: '查看和处理收到的家庭邀请' },
      households: { label: '我的家庭', description: '查看家庭安排，或创建、加入一个家庭' },
      reminders: { label: '提醒', description: '任务到期和日程开始前提醒你' },
    },
    logoutNote: '只影响这台设备，家庭里的内容会保留。',
    nickname: '昵称',
    pageTitle: '个人中心',
    title: '个人资料',
    username: '用户名',
    usernameNote: '用于登录，暂不支持修改。',
  },
};

export type Catalog = typeof zh;

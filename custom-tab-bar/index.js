/**
 * 自定义 tabBar
 * 5 个位置：总览 / 明细 / [＋记一笔] / 统计 / 设置
 * 页面在 onShow 里通过 this.getTabBar().setData({ selected }) 同步高亮
 */

Component({
  data: {
    selected: 0,
    list: [
      { id: 'tab1', text: '总览', icon: '📊', path: '/pages/dashboard/dashboard' },
      { id: 'tab2', text: '明细', icon: '📋', path: '/pages/records/records' },
      { id: 'add', text: '', icon: '', path: '', center: true },
      { id: 'tab3', text: '统计', icon: '📈', path: '/pages/stats/stats' },
      { id: 'tab4', text: '设置', icon: '⚙️', path: '/pages/settings/settings' }
    ]
  },

  methods: {
    onTap(e) {
      const index = Number(e.currentTarget.dataset.index)
      const item = this.data.list[index]
      if (!item) return

      // 中间按钮：打开记一笔
      if (item.center) {
        wx.navigateTo({ url: '/pages/edit/edit' })
        return
      }

      if (index === this.data.selected) return
      wx.switchTab({
        url: item.path,
        success: () => {
          this.setData({ selected: index })
        }
      })
    }
  }
})

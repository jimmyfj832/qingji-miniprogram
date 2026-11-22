/**
 * 环形图组件
 * 用法：
 *   <donut-chart items="{{items}}" total="{{total}}" center-label="总支出"
 *                center-value="¥1,234.00" thickness="{{18}}" />
 * items: [{ name, amount, color }]
 */

function pixelRatio() {
  try {
    if (typeof wx.getWindowInfo === 'function') {
      return wx.getWindowInfo().pixelRatio || 2
    }
  } catch (e) {}
  try {
    return wx.getSystemInfoSync().pixelRatio || 2
  } catch (e) {
    return 2
  }
}

Component({
  properties: {
    items: {
      type: Array,
      value: []
    },
    total: {
      type: Number,
      value: 0
    },
    centerLabel: {
      type: String,
      value: ''
    },
    centerValue: {
      type: String,
      value: ''
    },
    thickness: {
      type: Number,
      value: 18
    }
  },

  observers: {
    'items, total': function () {
      if (!this._ready) return
      this.draw()
    }
  },

  lifetimes: {
    ready() {
      this._ready = true
      this.draw()
    }
  },

  methods: {
    draw() {
      const that = this
      if (this._drawing) {
        this._pending = true
        return
      }
      this._drawing = true

      this.createSelectorQuery()
        .select('#donutCanvas')
        .fields({ node: true, size: true })
        .exec(function (res) {
          that._drawing = false
          const info = res && res[0]
          if (!info || !info.node || !info.width) return
          that.paint(info.node, info.width, info.height)
          if (that._pending) {
            that._pending = false
            that.draw()
          }
        })
    },

    paint(canvas, w, h) {
      const dpr = pixelRatio()
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)

      const ctx = canvas.getContext('2d')
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, w, h)

      const lw = this.properties.thickness
      const cx = w / 2
      const cy = h / 2
      const radius = Math.min(w, h) / 2 - lw / 2 - 1
      if (radius <= 0) return

      // 底环
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.lineWidth = lw
      ctx.strokeStyle = '#eef0f8'
      ctx.stroke()

      const items = this.properties.items || []
      const total = Number(this.properties.total) || 0
      if (!items.length || total <= 0) return

      const gap = items.length > 1 ? 0.04 : 0
      let angle = -Math.PI / 2

      ctx.lineCap = 'butt'
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        const v = Number(it.amount !== undefined ? it.amount : it.value) || 0
        const sweep = (v / total) * Math.PI * 2
        const from = angle + gap / 2
        const to = angle + sweep - gap / 2

        if (v > 0 && to > from) {
          ctx.beginPath()
          ctx.arc(cx, cy, radius, from, to)
          ctx.lineWidth = lw
          ctx.strokeStyle = it.color || '#6366f1'
          ctx.stroke()
        }
        angle += sweep
      }
    }
  }
})

import { coastlines } from './coast.mjs'
import { sites, serviceRegions } from './sites.mjs'

const rad = Math.PI / 180
function vector(lat, lon) {
  return [Math.cos(lat * rad) * Math.sin(lon * rad), Math.sin(lat * rad), Math.cos(lat * rad) * Math.cos(lon * rad)]
}
const shores = coastlines.map(line => line.map(([lon, lat]) => vector(lat, lon)))
const grid = []
for (let lat = -75; lat <= 75; lat += 15) {
  grid.push(Array.from({ length: 121 }, (_, i) => vector(lat, -180 + i * 3)))
}
for (let lon = -180; lon < 180; lon += 20) {
  grid.push(Array.from({ length: 61 }, (_, i) => vector(-90 + i * 3, lon)))
}
const pins = Object.entries(sites).map(([name, [lat, lon]]) => ({ name, position: vector(lat, lon) }))

export function mountGlobe(canvas, ticket, onPick) {
  const ctx = canvas.getContext('2d')
  const active = ticket.branches.map(branch => branch.name)
  const [hubName, hubLat, hubLon] = serviceRegions[ticket.destination]
  const hub = vector(hubLat, hubLon)
  const ticketPins = [...pins, { name: hubName, position: hub }]
  const routes = ticket.branches.map(branch => {
    const start = vector(...sites[branch.name])
    // Normalized interpolation follows the short great-circle path.
    const route = Array.from({ length: 55 }, (_, i) => {
      const fraction = i / 54
      const point = start.map((v, j) => v + (hub[j] - v) * fraction)
      const length = Math.hypot(...point)
      return point.map(v => v / length)
    })
    return { branch, route }
  })
  let selected = active[0]
  let [latitude, longitude] = sites[selected]
  let after = false
  let visiblePins = []
  let drag
  let frame = 0
  let replayAt = -Infinity
  let ride = null
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  let zoom = 1
  const controller = new AbortController()
  const options = { signal: controller.signal }

  function paint() {
    frame = 0
    if (!ctx || !canvas.clientWidth) return
    const w = canvas.clientWidth, h = canvas.clientHeight
    const dpr = Math.min(devicePixelRatio || 1, 2)
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const r = Math.min(w * .44, h * .45) * zoom, cx = w / 2, cy = h * .49
    const sl = Math.sin(longitude * rad), cl = Math.cos(longitude * rad)
    const sp = Math.sin(latitude * rad), cp = Math.cos(latitude * rad)
    function project([x,y,z]) {
      const forward = x * sl + z * cl
      return [cx + (x * cl - z * sl) * r, cy - (y * cp - forward * sp) * r, y * sp + forward * cp]
    }
    function stroke(lines, color, weight) {
      ctx.beginPath()
      for (const line of lines) {
        let pen = false
        for (const pos of line) {
          const [x,y,z] = project(pos)
          if (z >= 0) {
            if (pen) ctx.lineTo(x,y)
            else ctx.moveTo(x,y)
          }
          pen = z >= 0
        }
      }
      ctx.lineWidth = weight
      ctx.strokeStyle = color
      ctx.stroke()
    }
    const sea = ctx.createRadialGradient(cx-r*.36,cy-r*.42,r*.03,cx,cy,r)
    sea.addColorStop(0,'#1a626d')
    sea.addColorStop(.72,'#0b394b')
    sea.addColorStop(1,'#021828')
    ctx.beginPath()
    ctx.arc(cx,cy,r,0,2*Math.PI)
    ctx.fillStyle = sea
    ctx.shadowColor = '#16aeae'
    ctx.shadowBlur = 15
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = '#4ca7ab'
    ctx.lineWidth = 1
    ctx.stroke()
    stroke(grid, '#43768180', .7)
    stroke(shores, '#94d6cd', 1.05)
    const progress = (performance.now() - replayAt) / 1150
    for (const { branch, route } of routes) {
      const denied = after && branch.after === null
      ctx.setLineDash(denied ? [3, 3] : [])
      stroke([route], ride && ride.site !== branch.name ? '#4e737b' : denied ? '#ff9d99' : '#72fce2', ride?.site === branch.name ? 3 : 2)
      const selectedRide = ride?.site === branch.name
      if (selectedRide || (!ride && !denied && after && progress < 1 && !reducedMotion.matches)) {
        const phase = selectedRide && !reducedMotion.matches ? Math.min(1, (performance.now() - ride.started) / 530) : 1
        const position = selectedRide ? (ride.from + phase * (ride.fraction - ride.from)) * (denied ? .55 : 1) : progress
        if (selectedRide && phase < 1) schedule()
        const [x,y,z] = project(route[Math.max(0, Math.floor(position * (route.length - 1)))])
        if (z > 0) {
          ctx.beginPath()
          ctx.arc(x,y,4,0,2*Math.PI)
          ctx.fillStyle = '#eaffef'
          ctx.fill()
        }
      }
    }
    ctx.setLineDash([])
    if (after && progress < 1 && !reducedMotion.matches) schedule()
    visiblePins = []
    for (const pin of ticketPins) {
      const [x,y,z] = project(pin.position)
      if (z <= .01) continue
      const branch = ticket.branches.find(b => b.name === pin.name)
      const focus = pin.name === selected
      const color = branch ? (after && !branch.after ? '#ffa8a8' : '#28ffda') : pin.name === hubName ? '#fff4d3' : '#e6c173'
      visiblePins.push({ name: pin.name, x, y })
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x,y,branch ? 4 : 2.8,0,2*Math.PI)
      ctx.fill()
      if (focus) {
        ctx.beginPath()
        ctx.arc(x,y,8,0,2*Math.PI)
        ctx.strokeStyle = '#fff7d7'
        ctx.stroke()
        ctx.font = 'bold 12px system-ui'
        const width = ctx.measureText(pin.name).width + 12
        const labelX = Math.max(1, Math.min(w-width-1,x+12)), labelY = Math.max(17, Math.min(h-5,y-7))
        ctx.fillStyle = '#031a29ed'
        ctx.fillRect(labelX,labelY-14,width,20)
        ctx.fillStyle = '#fff7d7'
        ctx.fillText(pin.name,labelX+6,labelY)
      }
    }
  }

  function schedule() { if (!frame) frame = requestAnimationFrame(paint) }
  function center(name) {
    selected = name
    const coordinates = sites[name] || [hubLat, hubLon]
    latitude = coordinates[0]
    longitude = coordinates[1]
    zoom = 1
    schedule()
  }
  canvas.addEventListener('pointerdown', e => {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, longitude, latitude }
    canvas.setPointerCapture(e.pointerId)
  }, options)
  canvas.addEventListener('pointermove', e => {
    if (drag?.id !== e.pointerId) {
      const rect = canvas.getBoundingClientRect()
      const pin = visiblePins.find(p => Math.hypot(p.x-e.clientX+rect.left, p.y-e.clientY+rect.top) < 9)
      canvas.title = pin ? pin.name : 'Drag to rotate the globe'
      return
    }
    longitude = drag.longitude - (e.clientX - drag.x) * .45 / zoom
    latitude = Math.max(-85, Math.min(85, drag.latitude + (e.clientY-drag.y) * .45 / zoom))
    schedule()
  }, options)
  canvas.addEventListener('pointerup', e => {
    if (drag?.id !== e.pointerId) return
    const click = Math.hypot(e.clientX-drag.x, e.clientY-drag.y) < 5
    drag = null
    if (!click) return
    const rect = canvas.getBoundingClientRect()
    const nearby = visiblePins.map(pin => ({ ...pin, distance: Math.hypot(pin.x-e.clientX+rect.left,pin.y-e.clientY+rect.top) }))
      .filter(pin => pin.distance <= 15).sort((a,b) => a.distance-b.distance)
    if (nearby.length) onPick(nearby[0].name)
  }, options)
  canvas.addEventListener('pointercancel', () => { drag = null }, options)
  canvas.addEventListener('keydown', e => {
    const steps = { ArrowLeft: [-10,0], ArrowRight: [10,0], ArrowUp: [0,10], ArrowDown: [0,-10] }
    if (!steps[e.key]) return
    e.preventDefault()
    longitude += steps[e.key][0]
    latitude = Math.max(-85,Math.min(85,latitude + steps[e.key][1]))
    schedule()
  }, options)
  const observer = new ResizeObserver(schedule)
  observer.observe(canvas)
  schedule()
  return {
    center,
    toggleZoom() {
      zoom = zoom === 1 ? 1.8 : 1
      schedule()
      return zoom
    },
    ride(site, fraction) {
      const from = ride?.site === site ? ride.fraction : 0
      ride = { site, fraction, from, started: performance.now() }
      schedule()
    },
    setAfter(value) {
      ride = null
      after = value
      replayAt = value ? performance.now() : -Infinity
      schedule()
    },
    dispose() { controller.abort(); observer.disconnect(); cancelAnimationFrame(frame) },
  }
}

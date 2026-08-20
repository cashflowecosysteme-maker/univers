/**
 * starry-bg.js — Canvas ciel étoilé avec étoiles filantes
 * Aucune dépendance. Isolé.
 */
;(function () {
  'use strict'

  var canvas = document.getElementById('starry-canvas')
  if (!canvas) return

  var ctx = canvas.getContext('2d')
  var stars = []
  var shootingStars = []
  var STAR_COUNT = 400
  var SHOOTING_INTERVAL = 3000

  function resize() {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }

  function createStars() {
    stars = []
    for (var i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 1.5 + 0.3,
        opacity: Math.random() * 0.8 + 0.2,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        phase: Math.random() * Math.PI * 2
      })
    }
  }

  function createShootingStar() {
    shootingStars.push({
      x: Math.random() * canvas.width * 0.7,
      y: Math.random() * canvas.height * 0.3,
      length: Math.random() * 80 + 40,
      speed: Math.random() * 8 + 4,
      angle: Math.PI / 4 + (Math.random() - 0.5) * 0.3,
      opacity: 1,
      life: 1
    })
  }

  function drawStars(time) {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i]
      var flicker = Math.sin(time * s.twinkleSpeed + s.phase) * 0.3 + 0.7
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,' + (s.opacity * flicker).toFixed(3) + ')'
      ctx.fill()
    }
  }

  function drawShootingStars() {
    for (var i = shootingStars.length - 1; i >= 0; i--) {
      var ss = shootingStars[i]
      var tailX = ss.x - Math.cos(ss.angle) * ss.length
      var tailY = ss.y - Math.sin(ss.angle) * ss.length

      var grad = ctx.createLinearGradient(tailX, tailY, ss.x, ss.y)
      grad.addColorStop(0, 'rgba(255,255,255,0)')
      grad.addColorStop(1, 'rgba(255,255,255,' + (ss.opacity * ss.life).toFixed(3) + ')')

      ctx.beginPath()
      ctx.moveTo(tailX, tailY)
      ctx.lineTo(ss.x, ss.y)
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.5
      ctx.stroke()

      ss.x += Math.cos(ss.angle) * ss.speed
      ss.y += Math.sin(ss.angle) * ss.speed
      ss.life -= 0.015

      if (ss.life <= 0) shootingStars.splice(i, 1)
    }
  }

  function animate(time) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawStars(time)
    drawShootingStars()
    requestAnimationFrame(animate)
  }

  resize()
  createStars()
  requestAnimationFrame(animate)

  setInterval(createShootingStar, SHOOTING_INTERVAL)
  window.addEventListener('resize', function () {
    resize()
    createStars()
  })
})()

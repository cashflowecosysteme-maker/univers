/**
 * Boutique NyXia — complément médias du Super Admin
 * Ajoute vidéo descriptive + témoignage visuel sans modifier le gros index.html.
 */
;(function () {
  'use strict'

  var MEDIA_ENDPOINT = 'https://boutique.nyxia.top/api/admin/product-media'

  function el(id) { return document.getElementById(id) }

  function insertAfter(reference, node) {
    if (!reference || !reference.parentNode) return
    reference.parentNode.insertBefore(node, reference.nextSibling)
  }

  function makeWrap(html) {
    var template = document.createElement('template')
    template.innerHTML = html.trim()
    return template.content.firstElementChild
  }

  function injectFields() {
    if (el('bt-video-url')) return true

    var image4 = el('bt-image-4')
    var testimonialAuthor = el('bt-testimonial-author')
    if (!image4 || !testimonialAuthor) return false

    var image4Wrap = image4.closest('div')
    var mediaTitle = makeWrap(
      '<div style="grid-column:1/-1;margin-top:8px;padding-top:12px;border-top:1px solid rgba(123,92,255,.14)">' +
        '<div style="font-size:12px;font-weight:800;color:#c4b5fd;letter-spacing:.04em">VIDÉO DU PRODUIT</div>' +
        '<p class="hint" style="margin-top:4px">YouTube, Vimeo ou fichier MP4. La vidéo reste liée au produit pour la Boutique et les personnages NyXia.</p>' +
      '</div>'
    )
    insertAfter(image4Wrap, mediaTitle)

    var videoUrl = makeWrap('<div style="grid-column:1/-1"><label class="f">Vidéo descriptive (URL)</label><input class="f" id="bt-video-url" placeholder="https://... (YouTube, Vimeo ou MP4)"></div>')
    insertAfter(mediaTitle, videoUrl)

    var videoTitle = makeWrap('<div><label class="f">Titre de la vidéo (facultatif)</label><input class="f" id="bt-video-title" placeholder="Ex. Découvre ce parcours en 2 minutes"></div>')
    insertAfter(videoUrl, videoTitle)

    var videoPosition = makeWrap(
      '<div><label class="f">Afficher la vidéo</label><select class="f" id="bt-video-position">' +
        '<option value="gallery">Dans la galerie avec les images</option>' +
        '<option value="description">Après la description</option>' +
        '<option value="hidden">Ne pas afficher</option>' +
      '</select></div>'
    )
    insertAfter(videoTitle, videoPosition)

    var authorWrap = testimonialAuthor.closest('div')
    var testimonialImage = makeWrap('<div style="grid-column:1/-1"><label class="f">Image du témoignage (URL)</label><input class="f" id="bt-testimonial-image" placeholder="https://... (capture d’écran du témoignage)"><p class="hint">Dans la Boutique, l’image pourra être cliquée pour être agrandie.</p></div>')
    insertAfter(authorWrap, testimonialImage)

    var testimonialMode = makeWrap(
      '<div style="grid-column:1/-1"><label class="f">Afficher le témoignage</label><select class="f" id="bt-testimonial-mode">' +
        '<option value="text">Texte seulement</option>' +
        '<option value="image">Image seulement</option>' +
        '<option value="both">Texte + image</option>' +
      '</select></div>'
    )
    insertAfter(testimonialImage, testimonialMode)

    return true
  }

  function mediaPayloadFromFields() {
    return {
      videoUrl: el('bt-video-url') ? el('bt-video-url').value.trim() : '',
      videoTitle: el('bt-video-title') ? el('bt-video-title').value.trim() : '',
      videoPosition: el('bt-video-position') ? el('bt-video-position').value : 'gallery',
      testimonialImageUrl: el('bt-testimonial-image') ? el('bt-testimonial-image').value.trim() : '',
      testimonialMode: el('bt-testimonial-mode') ? el('bt-testimonial-mode').value : 'text'
    }
  }

  function fillMedia(media) {
    media = media || {}
    if (el('bt-video-url')) el('bt-video-url').value = media.videoUrl || ''
    if (el('bt-video-title')) el('bt-video-title').value = media.videoTitle || ''
    if (el('bt-video-position')) el('bt-video-position').value = ['gallery', 'description', 'hidden'].indexOf(media.videoPosition) >= 0 ? media.videoPosition : 'gallery'
    if (el('bt-testimonial-image')) el('bt-testimonial-image').value = media.testimonialImageUrl || ''
    if (el('bt-testimonial-mode')) el('bt-testimonial-mode').value = ['text', 'image', 'both'].indexOf(media.testimonialMode) >= 0 ? media.testimonialMode : 'text'
  }

  async function mediaApi(method, id, payload) {
    if (!window.TOKEN) throw new Error('Session Super Admin manquante.')
    var url = MEDIA_ENDPOINT + '?id=' + encodeURIComponent(id || '')
    var options = {
      method: method || 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Univers-Token': window.TOKEN
      }
    }
    if (method === 'POST') options.body = JSON.stringify(Object.assign({ id: id }, payload || {}))
    var response = await fetch(url, options)
    var data = await response.json().catch(function () { return {} })
    if (!response.ok) throw new Error(data.error || 'Impossible d’enregistrer les médias du produit.')
    return data
  }

  function patchFunctions() {
    if (window.__NYXIA_BOUTIQUE_MEDIA_PATCHED) return
    if (typeof window.btProductBody !== 'function' || typeof window.api !== 'function') return
    window.__NYXIA_BOUTIQUE_MEDIA_PATCHED = true

    var originalProductBody = window.btProductBody
    var originalEditProduct = window.btEditProduct
    var originalResetProduct = window.btResetProduct
    var originalApi = window.api

    window.btProductBody = function (source) {
      var body = originalProductBody(source)
      if (!source) {
        Object.assign(body, mediaPayloadFromFields())
        body.__mediaAdmin = true
      }
      return body
    }

    window.api = async function (path, method, body) {
      var out = await originalApi(path, method, body)
      if (path === '/api/boutique/products/save' && body && body.__mediaAdmin && out && out.res && out.res.ok && out.data && out.data.product && out.data.product.id) {
        await mediaApi('POST', out.data.product.id, {
          videoUrl: body.videoUrl || '',
          videoTitle: body.videoTitle || '',
          videoPosition: body.videoPosition || 'gallery',
          testimonialImageUrl: body.testimonialImageUrl || '',
          testimonialMode: body.testimonialMode || 'text'
        })
      }
      return out
    }

    window.btEditProduct = function (id) {
      var result = originalEditProduct(id)
      fillMedia({ videoPosition: 'gallery', testimonialMode: 'text' })
      mediaApi('GET', id).then(function (data) {
        fillMedia(data.media || {})
      }).catch(function (error) {
        if (typeof window.showMsg === 'function') window.showMsg('bt-product-msg', 'Produit chargé, mais les médias n’ont pas pu être lus : ' + error.message, false)
      })
      return result
    }

    window.btResetProduct = function (clearMessage) {
      var result = originalResetProduct(clearMessage)
      fillMedia({ videoPosition: 'gallery', testimonialMode: 'text' })
      return result
    }

    window.btToggleProduct = async function (id) {
      var p = (window.BT_PRODUCTS || []).find(function (item) { return item.id === id })
      if (!p) return
      try {
        var savedMedia = await mediaApi('GET', id)
        var out = await originalApi('/api/boutique/products/save', 'POST', Object.assign({}, p, { active: !p.active }))
        if (!out.res.ok) throw new Error(out.data.error || 'Erreur')
        await mediaApi('POST', id, savedMedia.media || {})
        if (typeof window.btLoad === 'function') await window.btLoad()
      } catch (error) {
        alert(error.message || error)
      }
    }
  }

  function init() {
    if (!injectFields()) {
      window.setTimeout(init, 80)
      return
    }
    patchFunctions()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true })
  else init()
})()

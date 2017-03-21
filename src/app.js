var SVG_NS = "http://www.w3.org/2000/svg"

export default function (app) {
  var view = app.view || function () {
    return ""
  }

  var model
  var actions = {}
  var subscriptions = []
  var hooks = {
    onError: [],
    onAction: [],
    onUpdate: [],
    onRender: []
  }

  var node
  var root
  var batch = []
  var plugins = app.plugins || []

  for (var i = -1; i < plugins.length; i++) {
    var plugin = i < 0 ? app : plugins[i](app)

    if (plugin.model != null) {
      model = merge(model, plugin.model)
    }

    if (plugin.actions) {
      init(actions, plugin.actions)
    }

    if (plugin.subscriptions) {
      subscriptions = subscriptions.concat(plugin.subscriptions)
    }

    var _hooks = plugin.hooks
    if (_hooks) {
      Object.keys(_hooks).forEach(function (key) {
        hooks[key].push(_hooks[key])
      })
    }
  }

  load(function () {
    root = app.root || document.body.appendChild(document.createElement("div"))

    render(model, view)

    for (var i = 0; i < subscriptions.length; i++) {
      subscriptions[i](model, actions, onError)
    }
  })

  function onError(error) {
    for (var i = 0; i < hooks.onError.length; i++) {
      hooks.onError[i](error)
    }

    if (i <= 0) {
      throw error
    }
  }

  function init(container, group, lastName) {
    Object.keys(group).forEach(function (key) {
      if (!container[key]) {
        container[key] = {}
      }

      var name = lastName ? lastName + "." + key : key
      var action = group[key]

      if (typeof action === "function") {
        container[key] = function (data) {
          for (var i = 0; i < hooks.onAction.length; i++) {
            hooks.onAction[i](name, data)
          }

          var result = action(model, data, actions, onError)

          if (result == null || typeof result.then === "function") {
            return result

          } else {
            for (var i = 0; i < hooks.onUpdate.length; i++) {
              hooks.onUpdate[i](model, result, data)
            }

            model = merge(model, result)
            render(model, view)
          }
        }
      } else {
        init(container[key], action, name)
      }
    })
  }

  function load(fn) {
    if (document.readyState[0] !== "l") {
      fn()
    } else {
      document.addEventListener("DOMContentLoaded", fn)
    }
  }

  function render(model, view) {
    for (var i = 0; i < hooks.onRender.length; i++) {
      view = hooks.onRender[i](model, view)
    }

    patch(root, node, node = view(model, actions), 0)

    for (var i = 0; i < batch.length; i++) {
      batch[i]()
    }

    batch = []
  }

  function merge(a, b) {
    var obj = {}

    if (isPrimitive(b) || Array.isArray(b)) {
      return b
    }

    for (var key in a) {
      obj[key] = a[key]
    }
    for (var key in b) {
      obj[key] = b[key]
    }

    return obj
  }

  function isPrimitive(type) {
    type = typeof type
    return type === "string" || type === "number" || type === "boolean"
  }

  function defer(fn, data) {
    setTimeout(function () {
      fn(data)
    }, 0)
  }

  function createElementFrom(node, isSVG) {
    if (typeof node === "string") {
      var element = document.createTextNode(node)

    } else {
      var element = (isSVG = isSVG || node.tag === "svg")
        ? document.createElementNS(SVG_NS, node.tag)
        : document.createElement(node.tag)

      for (var name in node.data) {
        if (name === "onCreate") {
          defer(node.data[name], element)
        } else {
          setElementData(element, name, node.data[name])
        }
      }

      for (var i = 0; i < node.children.length; i++) {
        element.appendChild(createElementFrom(node.children[i], isSVG))
      }
    }

    return element
  }

  function removeElementData(element, name, value) {
    element[name] = value
    element.removeAttribute(name)
  }

  function setElementData(element, name, value, oldValue) {
    name = name.toLowerCase()

    if (!value) {
      removeElementData(element, name, value, oldValue)

    } else if (name === "style") {
      for (var i in oldValue) {
        if (!(i in value)) {
          element.style[i] = ""
        }
      }

      for (var i in value) {
        element.style[i] = value[i]
      }
    } else {
      element.setAttribute(name, value)

      if (element.namespaceURI !== SVG_NS) {
        if (element.type === "text") {
          var oldSelStart = element.selectionStart
          var oldSelEnd = element.selectionEnd
        }

        element[name] = value

        if (oldSelStart >= 0) {
          element.setSelectionRange(oldSelStart, oldSelEnd)
        }
      }
    }
  }

  function updateElementData(element, data, oldData) {
    for (var name in merge(oldData, data)) {
      var value = data[name]
      var oldValue = oldData[name]
      var realValue = element[name]

      if (name === "onUpdate") {
        defer(value, element)

      } else if (
        value !== oldValue || realValue !== value
      ) {
        setElementData(element, name, value, oldValue)
      }
    }
  }

  function patch(parent, oldNode, node, index) {
    var element = parent.childNodes[index]

    if (oldNode === undefined) {
      parent.appendChild(createElementFrom(node))

    } else if (node === undefined) {
      batch.push(parent.removeChild.bind(parent, element))

      if (oldNode && oldNode.data && oldNode.data.onRemove) {
        defer(oldNode.data.onRemove, element)
      }

    } else if (
      node.tag !== oldNode.tag ||
      typeof node !== typeof oldNode ||
      isPrimitive(node) && node !== oldNode
    ) {
      if (typeof node === "string") {
        element.textContent = node
      } else {
        parent.replaceChild(createElementFrom(node), element)
      }
    } else if (node.tag) {
      updateElementData(element, node.data, oldNode.data)

      var len = node.children.length, oldLen = oldNode.children.length

      for (var i = 0; i < len || i < oldLen; i++) {
        patch(element, oldNode.children[i], node.children[i], i)
      }
    }
  }
}

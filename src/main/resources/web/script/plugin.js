dm4c.add_plugin("de.deepamehta.box-renderer-canvas", function() {

    var DEFAULT_TOPIC_COLOR = "hsl(210,100%,90%)"   // must match top/left color in color dialog (see below)
    var BOX_PAD_HORIZ = 16
    var BOX_PAD_VERT = 4
    var LABEL_COLOR = "black"
    var LABEL_OFFSET_X = 4
    var LABEL_OFFSET_Y = -2
    var LABEL_LINE_HEIGHT = 19  // in pixel, 19px = 1.2em
    var ICON_SCALE_FACTOR = 2
    var ICON_OFFSET_FACTOR = 1.5

    var PROP_COLOR = "dm4.boxrenderer.color"

    var canvas_view

    // === Webclient Listeners ===

    /**
     * Note: the Topicmaps plugin instantiates the topicmap renderers (as provided by the
     * installed plugins) at "init" time. Registering our customizers at "init_2" ensures
     * the respective topicmap renderer is available already.
     */
    dm4c.add_listener("init_2", function() {
        var canvas_renderer = dm4c.get_plugin("de.deepamehta.topicmaps")
            .get_topicmap_renderer("dm4.webclient.default_topicmap_renderer")
        //
        canvas_renderer.add_view_customizer(BoxView)
        canvas_renderer.add_viewmodel_customizer(BoxViewmodel)
    })

    dm4c.add_listener("topic_commands", function(topic) {
        return [
            {
                is_separator: true,
                context: "context-menu"
            },
            {
                label:   "Set Color",
                handler: do_open_color_dialog,
                context: "context-menu"
            }
        ]

        function do_open_color_dialog() {
            // Note: topics added to a topicmap while the Box Renderer is not active have no stored color
            var current_color = canvas_view.get_topic(topic.id).view_props[PROP_COLOR] || DEFAULT_TOPIC_COLOR
            var content = $()
            add_color_row("100%", "90%")
            add_color_row( "80%", "80%")
            //
            var color_dialog = dm4c.ui.dialog({
                id: "color-dialog",
                title: "Set Color",
                content: content
            })
            color_dialog.open()

            function add_color_row(saturation, light) {
                for (var i = 4; i < 12; i++) {
                    add_color_box("hsl(" + [(45 * i + 30) % 360, saturation, light] + ")")
                }
                content = content.add($("<br>").attr("clear", "all"))
            }

            function add_color_box(color) {
                var color_box = $("<div>").addClass("color-box").css("background-color", color).click(function() {
                    var view_props = {}
                    view_props[PROP_COLOR] = color
                    canvas_view.set_view_properties(topic.id, view_props)
                    color_dialog.destroy()
                })
                if (color == current_color) {
                    color_box.addClass("selected")
                }
                content = content.add(color_box)
            }
        }
    })

    // ------------------------------------------------------------------------------------------------- Private Classes

    function BoxView(_canvas_view) {

        // widen scope
        canvas_view = _canvas_view



        // === Hook Implementations ===

        /**
         * Adds "x1", "y1", "x2", "y2" properties to the topic view. Click detection relies on this bounding box.
         * Adds "width" and "height" custom properties.         Updated on topic update (label or type changed).
         * Adds "label_wrapper", "icon_size" custom properties. Updated on topic update (label or type changed).
         * Adds "label_pos", "icon_pos" custom properties.      Updated on topic move.
         *
         * @param   topic_view      A TopicView object.
         *                          Has "id", "type_uri", "label", "x", "y", "view_props", "dom" properties
         *                          plus the viewmodel-derived custom properties.
         */
        this.on_update_topic = function(topic_view, ctx) {
            sync_label_and_icon(topic_view, ctx)
            sync_geometry(topic_view)
        }

        this.on_move_topic = function(topic_view) {
            sync_geometry(topic_view)
        }

        // ---

        this.draw_topic = function(topic_view, ctx) {
            var tv = topic_view
            // 1) box
            // Note: topics added to a topicmap while the Box Renderer is not active have no stored color
            ctx.fillStyle = tv.view_props[PROP_COLOR] || DEFAULT_TOPIC_COLOR
            ctx.fillRect(tv.x1, tv.y1, tv.width, tv.height)
            // 2) label
            ctx.fillStyle = LABEL_COLOR
            tv.label_wrapper.draw(tv.label_pos.x, tv.label_pos.y, ctx)
            // 3) icon
            // Note: the icon object is not hold in the topic view, but looked up every time. This saves us
            // from touching all topic view objects once a topic type's icon changes (via view configuration).
            // Icon lookup is supposed to be a cheap operation.
            var icon = dm4c.get_type_icon(tv.type_uri)
            ctx.drawImage(icon, tv.icon_pos.x, tv.icon_pos.y, tv.icon_size.width, tv.icon_size.height)
        }

        this.on_mousedown = function(pos, modifier) {
            var tv = detect_topic_via_icon(pos.topicmap)
            if (tv) {
                dm4c.do_select_topic(tv.id)
                dm4c.topicmap_renderer.begin_association(tv.id, pos.canvas.x, pos.canvas.y)
            } else {
                return true     // perform default behavoir
            }

            function detect_topic_via_icon(pos) {
                return canvas_view.iterate_topics(function(tv) {
                    if (pos.x >= tv.icon_pos.x && pos.x < tv.icon_pos.x + tv.icon_size.width &&
                        pos.y >= tv.icon_pos.y && pos.y < tv.icon_pos.y + tv.icon_size.height) {
                        //
                        return tv
                    }
                })
            }
        }



        // === Private Methods ===

        function sync_label_and_icon(tv, ctx) {
            // label
            tv.label_wrapper = new js.TextWrapper(tv.label, dm4c.MAX_TOPIC_LABEL_WIDTH, LABEL_LINE_HEIGHT, ctx)
            var size = tv.label_wrapper.get_size()
            tv.width = Math.max(size.width + BOX_PAD_HORIZ,  LABEL_LINE_HEIGHT)
            tv.height = Math.max(size.height + BOX_PAD_VERT, LABEL_LINE_HEIGHT)
            // icon
            var icon = dm4c.get_type_icon(tv.type_uri)
            tv.icon_size = {
                width: icon.width   / ICON_SCALE_FACTOR,
                height: icon.height / ICON_SCALE_FACTOR
            }
        }

        function sync_geometry(tv) {
            // bounding box
            tv.x1 = tv.x - tv.width  / 2,
            tv.y1 = tv.y - tv.height / 2
            tv.x2 = tv.x1 + tv.width
            tv.y2 = tv.y1 + tv.height
            // label
            tv.label_pos = {
                x: tv.x1 + LABEL_OFFSET_X,
                y: tv.y1 + LABEL_LINE_HEIGHT + LABEL_OFFSET_Y
            }
            // icon
            tv.icon_pos = {
                x: tv.x2 - tv.icon_size.width  / ICON_OFFSET_FACTOR,
                y: tv.y2 - tv.icon_size.height / ICON_OFFSET_FACTOR
            }
        }
    }

    function BoxViewmodel() {

        this.enrich_view_properties = function(topic, view_props) {
            view_props[PROP_COLOR] = DEFAULT_TOPIC_COLOR
        }
    }
})

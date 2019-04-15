// -----------------------
// Graph parameters
// -----------------------
// nodes are growing proportionally to its number of predicates
const node_growing_factor = 2;
const node_init_radius = 30;
const link_color = '#999';
const node_resource_color = '#007fa4';
const node_value_color = '#E8E8E8';

let chat = new Vue({
    el: '#chat-app',
    data: {
        dataset_id: get_dataset_id(),
        dataset_fields: {},
        messages: [],
        correspondances: {},
        confirmed_correspondances: {'classes': [], 'properties': []},
        denied_correspondances: {'classes': [], 'properties': []},
        awaiting_correspondances: {'classes': [], 'properties': []},
        current_correspondance: {},
        current_correspondance_type: 'classes',
        awaiting_user: false,
        // Show or hide selector to interact with user
        yes_no_selector: true,
        class_selector: false,
        field_selector: false,
        get_mapping_selector: false,
        // autocomplete on fields
        suggestions: [],
        selected_field: null,
        is_finished: false,
        rml_mapping: null,
        source_domain_address: null,
        language: "en",
    },
    mounted: function () {
        this.bot_introduction();
        this.get_dataset_metas();
        this.init_field_selector();
    },
    methods: {
        init_field_selector: function () {
            $('#fieldTextBar').autocomplete({
                lookup: this.suggestions,
                onSelect: function (suggestion) {
                    chat.selected_field = suggestion;
                },
                minChars: 0,
                maxHeight: 200,
                formatResult: function _formatResult(suggestion, currentValue) {

                    var utils = $.Autocomplete.utils;

                    var pattern = '(' + utils.escapeRegExChars(currentValue) + ')';

                    if (suggestion.class) {
                        return '<b>' + suggestion.value
                                .replace(new RegExp(pattern, 'gi'), '<strong>$1<\/strong>')
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;')
                                .replace(/"/g, '&quot;')
                                .replace(/&lt;(\/?strong)&gt;/g, '<$1>') + '</b>'
                            + ' (' + suggestion.class + ')';
                    } else {
                        return '<b>' + suggestion.value
                            .replace(new RegExp(pattern, 'gi'), '<strong>$1<\/strong>')
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(/"/g, '&quot;')
                            .replace(/&lt;(\/?strong)&gt;/g, '<$1>') + '</b>';
                    }
                }
            });
        },
        push_user_message: function (message) {
            this.messages.push({
                text: message,
                type: 'user'
            });
            setTimeout(scroll_chat_to_bottom, 100);
        },
        push_bot_message: function (message) {
            chat.messages.push({
                text: message,
                type: 'bot'
            });
            setTimeout(scroll_chat_to_bottom, 100);
        },
        get_dataset_metas: function () {
            this.$http.get('https://data.opendatasoft.com/api/v2/catalog/datasets/' + this.dataset_id).then(response => {
                // domain url
                this.source_domain_address = response.body['dataset']['metas']['default']['source_domain_address'];
                // dataset language
                this.language = response.body['dataset']['metas']['default']['language'];
                // Compute url to mapping form
                mapping_set_url = this.get_mapping_set_url();
                $('#urlSetMapping').append("<a href=\"" + mapping_set_url + "\" target=\"_blank\">" + mapping_set_url + "</a>");
                // dataset fields
                for (i = 0; i < response.body['dataset']['fields'].length; i++) {
                    response.body['dataset']['fields'][i]['class'] = null;
                    this.dataset_fields[response.body['dataset']['fields'][i]['name']] = response.body['dataset']['fields'][i];
                    this.suggestions.push({"value": response.body['dataset']['fields'][i]['label'],
                                           "data": response.body['dataset']['fields'][i]['name'],
                                           "class": null});
                }
            });
        },
        get_mapping_set_url: function () {
            dataset_id = this.dataset_id.split('@')[0];
            return "https://" + this.source_domain_address + "/publish/" + dataset_id + "/#information";
        },
        bot_introduction: function () {
            // Welcome messages
            this.$http.get('/api/conversation/greeting').then(response => {
                this.push_bot_message(response.body['text']);
                this.$http.get('/api/conversation/instructions').then(response => {
                    this.push_bot_message(response.body['text']);
                    // Retrieve all correspondances (classes and properties)
                    this.$http.get('/api/' + this.dataset_id + '/correspondances').then(response => {
                        this.correspondances = response.body;
                        this.next_semantize();
                    }, response => {
                        this.$http.get('/api/conversation/error/lov-unavailable').then(response => {
                            this.push_bot_message(response.body['text']);
                            this.is_finished = true;
                        });
                    });
                });
            });
        },
        next_semantize: function () {
            if (this.correspondances['classes'].length > 0) {
                // 1. Confirm class correspondances
                this.current_correspondance_type = 'classes';
                this.current_correspondance = this.correspondances['classes'].pop();
                this.$http.post('/api/conversation/question/class', this.current_correspondance).then(response => {
                    this.push_bot_message(response.body['text']);
                    this.awaiting_user = true;
                });
            } else if (this.correspondances['properties'].length > 0) {
                // 2. Confirm properties correspondances
                this.current_correspondance_type = 'properties';
                this.current_correspondance = this.correspondances['properties'].pop();
                this.$http.post('/api/conversation/question/property', this.current_correspondance).then(response => {
                    this.push_bot_message(response.body['text']);
                    this.awaiting_user = true;
                });
            } else if (this.confirmed_correspondances['classes'].length < 0) {
                // 3. Check if correspondances are confirmed
                this.$http.get('/api/conversation/error/no-classes').then(response => {
                    this.push_bot_message(response.body['text']);
                    this.is_finished = true;
                });
            } else {
                // 4. Return the rml mapping
                this.$http.post('/api/' + this.dataset_id + '/correspondances/confirmed', this.confirmed_correspondances).then(response => {
                    this.$http.post('/api/' + this.dataset_id + '/correspondances/awaiting', this.awaiting_correspondances).then(response => {
                        this.$http.post('/api/' + this.dataset_id + '/correspondances/denied', this.denied_correspondances).then(response => {
                            this.$http.post('/api/' + this.dataset_id + '/correspondances/mapping', this.confirmed_correspondances).then(response => {
                                this.rml_mapping = response.body;
                                this.$http.get('/api/conversation/salutation').then(response => {
                                    this.push_bot_message(response.body['text']);
                                    this.is_finished = true;
                                    // switch selector
                                    this.hide_selectors();
                                    this.get_mapping_selector = true
                                    $('#resultModal').modal(show = true);
                                    $('#rmlMapping').append(Prism.highlight(this.rml_mapping, Prism.languages.yaml));
                                });
                            });
                        });
                    });
                });
            }
        },
        hide_selectors: function () {
            this.yes_no_selector = false;
            this.class_selector = false;
            this.field_selector = false;
            this.get_mapping_selector = false;
        },
        user_input_yes: function () {
            if (this.awaiting_user) {
                this.awaiting_user = false;
                this.push_user_message("Yes.");
                if (this.current_correspondance_type === 'properties') {
                    this.$http.post('/api/conversation/question/property-class', this.current_correspondance).then(response => {
                        this.push_bot_message(response.body['text']);
                        //update selector
                        this.hide_selectors();
                        this.field_selector = true;
                        this.awaiting_user = true;
                    });
                } else {
                    // class correspondance
                    this.confirmed_correspondances['classes'].push(this.current_correspondance);
                    this.dataset_fields[this.current_correspondance['field_name']]['class'] = this.current_correspondance['class'];
                    this.update_class_suggestions(this.current_correspondance['class'], this.current_correspondance['field_name']);
                    update_graph(this.current_correspondance, this.current_correspondance_type);
                    setTimeout(function () {
                        chat.next_semantize()
                    }, 1000);
                }
            }
        },
        user_input_idk: function () {
            if (this.awaiting_user) {
                this.awaiting_user = false;
                this.push_user_message("I don't know.");
                this.awaiting_correspondances[this.current_correspondance_type].push(this.current_correspondance);
                setTimeout(function () {
                    chat.next_semantize()
                }, 1000);
            }
        },
        user_input_no: function () {
            if (this.awaiting_user) {
                this.awaiting_user = false;
                this.push_user_message("No.");
                this.denied_correspondances[this.current_correspondance_type].push(this.current_correspondance);
                setTimeout(function () {
                    chat.next_semantize()
                }, 1000);
            }
        },
        user_input_property_class: function (associated_class) {
            if (this.awaiting_user) {
                if (associated_class == null) {
                    this.awaiting_user = false;
                    this.push_user_message('None of those');
                    this.current_correspondance['associated_class'] = [];
                    this.current_correspondance['associated_field'] = [];
                    this.denied_correspondances[this.current_correspondance_type].push(this.current_correspondance);
                    //update selector
                    this.hide_selectors();
                    this.yes_no_selector = true;
                    setTimeout(function () {
                        chat.next_semantize()
                    }, 1000);
                } else {
                    this.awaiting_user = false;
                    this.push_user_message(associated_class['class']);
                    this.current_correspondance['associated_class'] = associated_class['class'];
                    this.current_correspondance['associated_field'] = associated_class['field_name'];
                    this.confirmed_correspondances[this.current_correspondance_type].push(this.current_correspondance);
                    //update selector
                    this.hide_selectors();
                    this.yes_no_selector = true;
                    update_graph(this.current_correspondance, this.current_correspondance_type);
                    setTimeout(function () {
                        chat.next_semantize()
                    }, 1000);
                }
            }
        },
        user_input_property_field: function (associated_field) {
            if (this.awaiting_user) {
                if (associated_field == null) {
                    this.awaiting_user = false;
                    this.push_user_message('None of those');
                    this.current_correspondance['associated_class'] = [];
                    this.current_correspondance['associated_field'] = [];
                    this.denied_correspondances[this.current_correspondance_type].push(this.current_correspondance);
                    //update selector
                    this.hide_selectors();
                    this.yes_no_selector = true;
                    setTimeout(function () {
                        chat.next_semantize()
                    }, 1000);
                } else {
                    this.awaiting_user = false;
                    this.push_user_message(associated_field.value);
                    // update domain and range class correspondances
                    this.current_correspondance['domain']['label'] = associated_field.value;
                    this.current_correspondance['domain']['field_name'] = associated_field.data;
                    if (this.current_correspondance['range']) {
                        this.current_correspondance['range']['label'] = this.current_correspondance['label'];
                        this.current_correspondance['range']['field_name'] = this.current_correspondance['field_name'];
                        this.confirmed_correspondances['classes'].push(this.current_correspondance['range']);
                        this.update_class_suggestions(this.current_correspondance['range']['class'], this.current_correspondance['range']['field_name']);
                        update_graph(this.current_correspondance['range'], 'classes');
                    }
                    this.current_correspondance['associated_class'] = this.current_correspondance['domain']['class'];
                    this.current_correspondance['associated_field'] = associated_field.data;
                    this.confirmed_correspondances['classes'].push(this.current_correspondance['domain']);
                    this.update_class_suggestions(this.current_correspondance['domain']['class'], this.current_correspondance['domain']['field_name']);
                    update_graph(this.current_correspondance['domain'], 'classes');
                    this.confirmed_correspondances[this.current_correspondance_type].push(this.current_correspondance);
                    //update selector
                    this.hide_selectors();
                    this.yes_no_selector = true;
                    update_graph(this.current_correspondance, this.current_correspondance_type);
                    setTimeout(function () {
                        chat.next_semantize();
                    }, 1000);
                }
            }
        },
        get_mapping_btn: function () {
            $('#resultModal').modal(show = true);
        },
        update_class_suggestions: function (clss, field_name) {
            for (i = 0; i < this.suggestions.length; i++) {
                if (this.suggestions[i]['data'] === field_name) {
                    if ((! this.suggestions[i]['class']) || (this.suggestions[i]['class'] === 'Thing')){
                        this.suggestions[i]['class'] = clss;
                    }
                }
            }
        },
    },
});


$(function () {
    $('.Global-container').keypress(function (e) {
        if (chat.field_selector && e.which === 13) {
            if (chat.selected_field.data in chat.dataset_fields) {
                document.getElementById("fieldTextBar").classList.remove("is-invalid");
                chat.user_input_property_field(chat.selected_field);
                document.getElementById("fieldTextBar").value = '';
            } else {
                document.getElementById("fieldTextBar").classList.add("is-invalid");
            }
        }
    })
});

new ClipboardJS('.btn-rml', {
    container: document.getElementById('resultModal')
});


// -----------------------
// D3JS part for the graph
// -----------------------
let nodes = [];
let links = [];
let edgepaths;
let edgelabels;

let colors = d3.scaleOrdinal(d3.schemeCategory10);

let svg = d3.select("svg"),
    width = +svg.attr("width"),
    height = +svg.attr("height"),
    node,
    link;

let simulation = d3.forceSimulation()
    .force("link", d3.forceLink().id(function (d) {
        return d.id;
    }).distance(150).strength(1))
    .force("charge", d3.forceManyBody().strength(-25).distanceMax(100))
    .force("center", d3.forceCenter(0, 0));

update(links, nodes);

function update(links, nodes) {
    svg.selectAll("*").remove();

    svg.append('defs').append('marker')
        .attrs({
            'id': 'arrowhead',
            'viewBox': '-0 -5 10 10',
            'refX': function (d) {
                if (d) {
                    return d.target.radius;
                } else {
                    return node_init_radius;
                }
            },
            'refY': 0,
            'orient': 'auto',
            'markerWidth': 13,
            'markerHeight': 13,
            'xoverflow': 'visible'
        })
        .append('svg:path')
        .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
        .attr('fill', link_color)
        .style('stroke', 'none');

    link = svg.selectAll(".link")
        .data(links)
        .enter()
        .append("line")
        .attr("class", "link")
        .attr('marker-end', 'url(#arrowhead)')

    link.append("title")
        .text(function (d) {
            return d.type;
        });

    edgepaths = svg.selectAll(".edgepath")
        .data(links)
        .enter()
        .append('path')
        .attrs({
            'class': 'edgepath',
            'fill-opacity': 0,
            'stroke-opacity': 0,
            'id': function (d, i) {
                return 'edgepath' + i
            }
        })
        .style("pointer-events", "none");

    edgelabels = svg.selectAll(".edgelabel")
        .data(links)
        .enter()
        .append('text')
        .style("pointer-events", "none")
        .attrs({
            'class': 'edgelabel',
            'id': function (d, i) {
                return 'edgelabel' + i
            },
            'font-size': 12,
            'fill': link_color
        });

    edgelabels.append('textPath')
        .attr('xlink:href', function (d, i) {
            return '#edgepath' + i
        })
        .style("text-anchor", "middle")
        .attr("class", "noselect")
        .attr("startOffset", "50%")
        .text(function (d) {
            return d.label
        });

    node = svg.selectAll(".node")
        .data(nodes)
        .enter()
        .append("g")
        .attr("class", "node")
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
        );

    node.append("circle")
        .attr("r", function (d) {
            return (d.radius);
        })
        .style("fill", function (d) {
            return (d.group === "resource") ? node_resource_color : node_value_color;
        });

    node.append("title")
        .text(function (d) {
            return d.id;
        });

    node.append("text")
        .attr("font-size", "10")
        .attr("class", "noselect")
        .attr("text-anchor", "middle")
        .attr("dy", 0)
        .append("tspan")
        .text(function (d) {
            return d.field_label;
        });
    node.select("text").append("tspan")
        .attr("x", "0")
        .attr("dy", "1em")
        .text(function (d) {
            return "(" + d.label + ")";
        });

    simulation
        .nodes(nodes)
        .on("tick", ticked);

    simulation.force("link")
        .links(links);
}

function ticked() {
    link
        .attr("x1", function (d) {
            return d.source.x;
        })
        .attr("y1", function (d) {
            return d.source.y;
        })
        .attr("x2", function (d) {
            return d.target.x;
        })
        .attr("y2", function (d) {
            return d.target.y;
        });
    node
        .attr("transform", function (d) {
            return "translate(" + d.x + ", " + d.y + ")";
        });

    edgepaths.attr('d', function (d) {
        return 'M ' + d.source.x + ' ' + d.source.y + ' L ' + d.target.x + ' ' + d.target.y;
    });

    edgelabels.attr('transform', function (d) {
        if (d.target.x < d.source.x) {
            var bbox = this.getBBox();

            let rx = bbox.x + bbox.width / 2;
            let ry = bbox.y + bbox.height / 2;
            return 'rotate(180 ' + rx + ' ' + ry + ')';
        } else {
            return 'rotate(0)';
        }
    });
}

function dragstarted(d) {
    if (!d3.event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
}

function update_graph(correspondance, correspondance_type) {
    let existing_node_id = get_node_id(correspondance.field_name);
    if (correspondance_type === "classes") {
        if (existing_node_id) {
            // Update the class of the corresponding field
            if (! nodes[existing_node_id]['label'] || nodes[existing_node_id]['label'] === 'Thing') {
                nodes[existing_node_id]['label'] = correspondance.class;
            }
        }else {
            nodes.push({
                id: correspondance.field_name,
                field_name: correspondance.field_name,
                field_label: correspondance.label,
                label: correspondance.class,
                group: 'resource',
                radius : node_init_radius
            });
        }
    } else {
        if (existing_node_id == null || nodes[existing_node_id].id === correspondance.associated_field) {
            let id = correspondance.field_name + "_value";
            nodes.push({
                id: id,
                field_name: correspondance.field_name,
                field_label: correspondance.label,
                radius : node_init_radius,
                label: 'Dataset Field',
                group: 'value'
            });
            links.push({source: correspondance.associated_field, target: id, label: correspondance.description});
        } else {
            links.push({
                source: correspondance.associated_field,
                target: correspondance.field_name,
                label: correspondance.description
            });
        }
        // Node is growing proportionally to its number of predicates
        let source_node_id = get_node_id(correspondance.associated_field);
        nodes[source_node_id].radius += node_growing_factor;
    }
    update(links, nodes);
    simulation.alphaTarget(0.3).restart();
}

function get_node_id(field_name) {
    for (i in nodes) {
        if (field_name === nodes[i].id) {
            return i;
        }
    }
    return null
}

let chart = $("#chart"),
    aspect = chart.width() / chart.height(),
    container = chart.parent();
$(window).on("resize", function () {
    var targetWidth = container.width();
    chart.attr("width", targetWidth);
    chart.attr("height", Math.round(targetWidth / aspect));
}).trigger("resize");
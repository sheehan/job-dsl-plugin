(function($) {

    var DslLoader = function() {
        this.dslsByUrl = {};
    };
    _.extend(DslLoader.prototype, {

        fetch: function(url) {
            var dsl = this.dslsByUrl[url];
            if (!dsl) {
                return $.get(url).then(function(data) {
                    _.forEach(data.contexts, function(context) { this.processContext(context); }, this);
                    this.dslsByUrl[url] = data;
                    return data;
                }.bind(this));
            }
            return $.Deferred().resolveWith(null, [dsl]);
        },

        processContext: function(context) {
            var tokens = context.type.split('.');
            var simpleClassName = tokens[tokens.length - 1];
            context.simpleClassName = simpleClassName;

            context.methods.forEach(function(method) {
                if (method.signatures.every(function(sig) { return sig.deprecated; })) {
                    method.deprecated = true;
                }

                if (method.plugin) {
                    method.plugin = window.updateCenter.data.plugins[method.plugin];
                }
            });
        }
    });

    var App = function() {
        this.dslLoader = new DslLoader();

        this.initLayout();
        this.loadSelectedDsl();

        $('.version-select').change(this.loadSelectedDsl.bind(this));

        window.addEventListener('hashchange', this.onHashChange.bind(this), false);
    };

    _.extend(App.prototype, {

        onHashChange: function(e) {
            e.preventDefault();
            e.stopPropagation();

            this.updateDetailFromHash();
            this.updateTreeFromHash();
        },

        updateDetailFromHash: function() {
            var hashId = window.location.hash;
            if (hashId) {
                hashId = hashId.substring(1);
                var index = hashId.indexOf('/');
                if (index !== -1) {
                    var type = hashId.substr(0, index);
                    var value = hashId.substr(index + 1);

                    if (type === 'path') {
                        this.showPathDetail(value);
                    } else if (type === 'method') {
                        var methodIndex = value.lastIndexOf('.');
                        var contextClass = value.substr(0, methodIndex);
                        var methodName = value.substr(methodIndex + 1);
                        this.showMethodDetail(contextClass, methodName);
                    } else if (type === 'plugin') {
                        var plugin = _.find(this.plugins, function(plugin) { return plugin.name === value; });
                        this.showPluginDetail(plugin);
                    }
                }
            } else {
                this.showPathDetail();
            }
            this.layout.resizeAll();
        },

        loadSelectedDsl: function() {
            var url = $('.version-select').val();
            this.dslLoader.fetch(url).then(this.onDslFetchComplete.bind(this));
        },

        onDslFetchComplete: function(data) {
            this.data = data;
            this.plugins = this.getPluginList(data);
            this.initTree(data);

            var allItems = [];
            _.forEach(this.data.contexts, function(context, clazz) {
                context.methods.forEach(function(method) {
                    allItems.push({
                        name: method.name,
                        clazz: clazz,
                        simpleClassName: context.simpleClassName
                    });
                });
            });

            allItems = allItems.concat(this.plugins.map(function(plugin) {
                return {
                    name: plugin.name,
                    title: plugin.title
                };
            }));
            allItems = _.sortBy(allItems, function(item) { return item.name.toLowerCase(); });

            $('.search-input').keyup(function() {
                var val = $('.search-input').val();
                if (val) {
                    if ($('.tree-body').is(':visible')) {
                        $('.tree-body').hide();
                        $('.search-results').show();
                    }

                    var matches = allItems.filter(function(item) {
                        return item.name.toLowerCase().indexOf(val) !== -1;
                    }, this);
                    var html = Handlebars.templates['searchResults']({results: matches});
                    $('.search-results').html(html);
                    // update result list
                } else {
                    $('.tree-body').show();
                    $('.search-results').hide();
                }
            }.bind(this));


            this.updateDetailFromHash();
        },

        initLayout: function() {
            this.layout = $('.layout-container').layout({
                north__paneSelector: '.title',
                north__spacing_open: 0,
                west__paneSelector: '.tree',
                west__contentSelector: '.tree-wrapper',
                west__size: 360,
                west__minSize: 360,
                west__spacing_open: 3,
                west__resizerCursor: 'ew-resize',
                center__paneSelector: '.detail-wrapper',
                north__size: 50,
                resizable: true,
                closable: false
            });
        },

        getPluginList: function(data) {
            var plugins = [];

            _.forEach(data.contexts, function(context) {
                context.methods.forEach(function(method) {
                    if (method.plugin) {
                        plugins.push(method.plugin);
                    }
                });
            });

            plugins = _.uniq(plugins);
            return _.sortBy(plugins, 'name');
        },

        initTree: function(data) {
            var $treeBody = $('.tree-body');


            var updateNodes = function() {
                $treeBody.find('.jstree-open > i.jstree-icon')
                    .removeClass('glyphicon-triangle-right').addClass('glyphicon glyphicon-triangle-bottom');
                $treeBody.find('.jstree-closed > i.jstree-icon')
                    .removeClass('glyphicon-triangle-bottom').addClass('glyphicon glyphicon-triangle-right');
            };
            $treeBody.on('open_node.jstree', function(e, data){
                updateNodes();
            });

            $treeBody.on('close_node.jstree', function(e, data){
                updateNodes();
            });

            $treeBody
                .jstree('destroy')
                .on('changed.jstree', this.onTreeChanged.bind(this))
                .on('ready.jstree', function() {
                    this.updateTreeFromHash();
                    var selectedNodes = this.jstree.get_selected(true);
                    if (selectedNodes.length) {
                        $('#' + selectedNodes[0].id)[0].scrollIntoView();
                    }
                    updateNodes();
                }.bind(this))
                .jstree({
                    'plugins': ['wholerow'],
                    'core': {
                        'data': function(node, cb) {
                            var contextClass = node.id === '#' ? data.root.contextClass : node.original.methodNode.contextClass;
                            var methods = data.contexts[contextClass].methods;
                            var treeNodes = methods.map(function(method) {
                                return this.buildJstreeNode(method, node);
                            }, this);

                            cb(treeNodes);
                        }.bind(this),
                        'themes': {
                            'name': 'proton',
                            'responsive': true
                        },
                        'multiple': false,
                        'worker': false
                    }
                });
            this.jstree = $treeBody.jstree();
        },

        onTreeChanged: function(e, data) {
            e.preventDefault();
            window.location.hash = 'path/' + data.node.id;
        },

        updateTreeFromHash: function() {
            var hashId = window.location.hash;
            this.jstree.deselect_all(true);

            if (hashId && hashId.indexOf('#path/') === 0) {
                $('.tree-body').show();
                $('.search-results').hide();

                var path = hashId.substring(6);
                var tokens = path.split('-');
                tokens.forEach(function(token, index) {
                    var id = tokens.slice(0, index + 1).join('-');
                    var node = this.jstree.get_node(id);
                    if (index < tokens.length - 1) {
                        this.jstree.open_node(node);
                    } else {
                        this.jstree.select_node(node.id);
                    }
                }, this);
            }
        },

        showPluginDetail: function(plugin) {

            var usages = [];
            _.forEach(this.data.contexts, function(context) {
                context.methods.forEach(function(method) {
                    if (method.plugin === plugin) {
                        usages.push({method: method, context: context});
                    }
                });
            });

            var html = Handlebars.templates['pluginDetail']({plugin: plugin, usages: usages});
            $('.detail-wrapper').html(html);
        },

        showMethodDetail: function(contextClass, methodName) {
            var methodNode = _.find(this.data.contexts[contextClass].methods, function(method) { return method.name === methodName; });
            var data = {
                methodNode: methodNode,
                name: methodNode.name
            };
            if (methodNode.contextClass) {
                data.contextMethods = this.data.contexts[methodNode.contextClass].methods.map(function(method) {
                    var href = '#method/' + methodNode.contextClass + '.' + method.name;
                    return {
                        href: href,
                        method: method
                    }
                });
            }

            var usages = [];
            _.forEach(this.data.contexts, function(context, clazz) {
                context.methods.forEach(function(method) {
                    if (method.contextClass === contextClass) {
                        usages.push({
                            method: method,
                            context: context,
                            simpleClassName: context.simpleClassName
                        });
                    }
                });
            });
            data.usages = _.sortBy(usages, function(usage) { return (usage.method.name + usage.simpleClassName).toLowerCase(); });

            var html = Handlebars.templates['detail'](data);
            $('.detail-wrapper').html(html);

            $('pre.highlight')
                .add('.method-doc pre code')
                .each(function(i, block) { hljs.highlightBlock(block); });

            $('.method-doc pre').addClass('highlight');
        },

        showPathDetail: function(path) {
            var node = this.data.contexts[this.data.root.contextClass];
            var methodNode;
            var ancestors = [];
            if (path) {
                var tokens = path.split('-');
                tokens.forEach(function(token, index) {
                    var id = tokens.slice(0, index + 1).join('-');
                    methodNode = _.find(node.methods, function(method) { return method.name === token; });
                    node = this.data.contexts[methodNode.contextClass];
                    if (index < tokens.length - 1) {
                        ancestors.push({
                            id: id,
                            text: token
                        });
                    }
                }, this);
            } else {
                methodNode = this.data.root;
            }
            var data = {
                methodNode: methodNode,
                name: methodNode.name,
                ancestors: ancestors,
                isRoot: !path
            };
            if (methodNode.contextClass) {
                data.contextMethods = this.data.contexts[methodNode.contextClass].methods.map(function(method) {
                    var href = '#path/' + (path ? path + '-' : '') + method.name;
                    return {
                        href: href,
                        method: method
                    }
                });
            }
            var html = Handlebars.templates['detail'](data);
            $('.detail-wrapper').html(html);

            $('pre.highlight')
                .add('.method-doc pre code')
                .each(function(i, block) {
                    hljs.highlightBlock(block);
                });
            $('.method-doc pre').addClass('highlight');
        },

        getTreeNodeAncestors: function(node) {
            var parentNodes = node.parents.map(function(parentId) { return this.jstree.get_node(parentId); }, this).reverse();
            return parentNodes.filter(function(parentNode) { return parentNode.text; });
        },

        buildJstreeNode: function(node, parent) {
            var id = parent.id === '#' ? node.name : parent.id + '-' + node.name;
            var treeNode = {
                id: id,
                text: node.name,
                icon: false,
                methodNode: node,
                children: !!(node.contextClass)
            };

            if (node.deprecated) {
                treeNode.a_attr = {'class': 'deprecated'};
            }
            return treeNode;
        }
    });

    $(function() {
        new App();
    });
}(jQuery));
var VERSIONS = [
    '1.31-SNAPSHOT'
];

var gulp        = require('gulp');
var handlebars  = require('gulp-handlebars');
var wrap        = require('gulp-wrap');
var declare     = require('gulp-declare');
var concat      = require('gulp-concat');
var less        = require('gulp-less');
var path        = require('path');
var minifyCss   = require('gulp-minify-css');
var connect     = require('gulp-connect');
var watch       = require('gulp-watch');
var del         = require('del');
var merge       = require('merge-stream');
var htmlreplace = require('gulp-html-replace');

gulp.task('templates', function(){
    var templates = gulp.src('./src/templates/*.hbs')
        .pipe(handlebars())
        .pipe(wrap('Handlebars.template(<%= contents %>)'))
        .pipe(declare({
            namespace: 'Handlebars.templates'
        }))
        .pipe(concat('templates.js'));

    var js = gulp.src('./src/js/**/*.js');

    return merge(js, templates)
        .pipe(concat('app.js'))
        .pipe(gulp.dest('./dist/js/'));
});

gulp.task('less', function () {
    return gulp.src('./src/css/**/*.less')
        .pipe(less())
        .pipe(minifyCss({keepBreaks:true}))
        .pipe(concat('app.css'))
        .pipe(gulp.dest('./dist/css/'));
});

gulp.task('watch', function () {
    gulp.watch(['./src/**/*', 'gulpfile.js'], ['build']);
});

gulp.task('connect', ['watch'], function() {
    connect.server({root: '..'});
});

gulp.task('clean', function() {
    del.sync(['dist']);
});

gulp.task('htmlreplace', function() {
    return gulp.src('./src/index.html')
        .pipe(htmlreplace({
            versions: {
                src: VERSIONS.map(function(v) { return [v, v]}),
                tpl: '<option value="job-dsl-api/data/dsl-%s.json">v%s</option>'
            }
        }))
        .pipe(gulp.dest('..'));
});

gulp.task('build', ['clean', 'templates', 'less', 'htmlreplace']);

gulp.task('default', ['build']);
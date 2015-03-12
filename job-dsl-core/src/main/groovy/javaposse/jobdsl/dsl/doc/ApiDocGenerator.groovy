package javaposse.jobdsl.dsl.doc

import groovy.json.JsonBuilder
import javaposse.jobdsl.dsl.JobParent
import org.codehaus.groovy.groovydoc.*
import org.pegdown.Extensions
import org.pegdown.PegDownProcessor

import java.lang.annotation.Annotation
import java.lang.reflect.Field
import java.lang.reflect.Method
import java.lang.reflect.ParameterizedType
import java.lang.reflect.Type

class ApiDocGenerator {

    GroovyDocHelper docHelper
    String version
    String outputPath
    String commandDocsPath
    Class rootClass

    static void main(String[] args) {
        String version = args[0]

        new ApiDocGenerator(
            version: version,
            outputPath: "../job-dsl-api/data/dsl-${version}.json",
            commandDocsPath: '../docs/api',
            rootClass: JobParent,
            docHelper: new GroovyDocHelper('../job-dsl-core/src/main/groovy/')
        ).generateApi()
    }

    void generateApi() {
        Map map = [
            version: version,
            context: processClass(rootClass)
        ]

        String html = markdownToHtml(getMarkdownFromFile('/root'))
        map.html = html

        JsonBuilder builder = new JsonBuilder()
        builder map

        File file = new File(outputPath)
        file.parentFile.mkdirs()

        println "writing to: $file.absolutePath"
        file.withWriter { it << builder.toPrettyString() }
    }

    String getMarkdownFromFile(String path) {
        File file = new File("${commandDocsPath}${path}.md")
        file.exists() ? file.text : null
    }

    Map processClass(Class clazz, String path = '') {
        Map map = [type: clazz.name]

        map.methods = getMethodsForClass(clazz, path)
        getDelegateClasses(clazz).each { Class delegateClass ->
            map.methods.addAll getMethodsForClass(delegateClass, path)
        }
        map.methods = map.methods.sort { it.name }
        map
    }

    List<Class> getDelegateClasses(Class clazz) {
        GroovyClassDoc classDoc = docHelper.getGroovyClassDoc(clazz)
        List delegateNames = classDoc.properties().findAll {
            it.annotations().any {GroovyAnnotationRef a -> a.name == 'Delegate'}
        }*.name()

        Field[] declaredFields = clazz.declaredFields.findAll { delegateNames.contains it.name }
        declaredFields*.type
    }

    List getMethodsForClass(Class clazz, String path) {
        List<String> methodNames = clazz.methods.findAll { it.getAnnotation DslMethodDoc }*.name.unique().sort()
        methodNames.collect { processMethodName it, clazz, path }
    }

    Map processMethodName(String methodName, Class clazz, String path) {
        String newPath = path + '/' + methodName

        Map methodMap = [
            name      : methodName,
            signatures: []
        ]

        GroovyMethodDoc[] methodDocs = docHelper.getAllMethods(clazz).findAll { it.name() == methodName }

        List<DslMethodDoc> annotations = methodDocs.collect { GroovyMethodDoc methodDoc ->
            Method method = GroovyDocHelper.getMethodFromGroovyMethodDoc(methodDoc, clazz)
            method.getAnnotation(DslMethodDoc)
        }.findAll()

        methodDocs.each { GroovyMethodDoc methodDoc ->
            Method method = GroovyDocHelper.getMethodFromGroovyMethodDoc(methodDoc, clazz)
            methodMap.signatures << processMethod(method, methodDoc)

            Class contextClass = getContextClass(method, methodDoc)
            if (contextClass) {
                methodMap.context = processClass(contextClass, newPath)
            }
        }

        String dslPlugin = annotations.find { it.plugin() }?.plugin()
        if (dslPlugin) {
            methodMap.plugin = dslPlugin
        }

        String exampleXml = annotations.find { it.exampleXml() }?.exampleXml()
        if (exampleXml) {
            methodMap.exampleXml = exampleXml.stripIndent().trim()
        }

        String markdownFromFile = getMarkdownFromFile("/${clazz.name.replaceAll('\\.', '/')}/$methodName")
        if (markdownFromFile) {
            methodMap.html = markdownToHtml(markdownFromFile)
            methodMap.firstSentenceCommentText = markdownFromFile.trim().split('\n', 2)[0]
        } else {
            GroovyMethodDoc docWithComment = methodDocs.find { parseComment(it)?.trim() }
            if (docWithComment) {
                String text = parseComment(docWithComment)?.trim()
                methodMap.html = markdownToHtml(text)
                methodMap.firstSentenceCommentText = docWithComment.firstSentenceCommentText()
            }
        }

        methodMap
    }

    String markdownToHtml(String markdown) {
        PegDownProcessor processor = new PegDownProcessor(Extensions.FENCED_CODE_BLOCKS | Extensions.SUPPRESS_ALL_HTML)
        processor.markdownToHtml markdown
    }

    String parseComment(GroovyMethodDoc methodDoc) {
        String commentText = methodDoc.rawCommentText
        List sanitized = []
        commentText.eachLine { String line ->
            line = line.replaceAll(/^\s+\* ?/, '')
            if (!line.startsWith('@')) {
                sanitized << line
            }
        }
        sanitized.join('\n')
    }

    Class getContextClass(Method method, GroovyMethodDoc methodDoc) {
        Class clazz = null
        GroovyParameter[] groovyParameters = methodDoc.parameters()
        if (groovyParameters.length) {
            Annotation[][] parameterAnnotations = method.parameterAnnotations
            clazz = getContextClass(groovyParameters[-1], parameterAnnotations[-1])
        }
        clazz
    }

    Class getContextClass(GroovyParameter parameter, Annotation[] annotations) {
        Class clazz = null
        if (parameter.typeName() == 'groovy.lang.Closure') {
            DelegatesTo annotation = annotations.find { it.annotationType() == DelegatesTo } as DelegatesTo
            if (annotation) {
                clazz = annotation.value()
            }
        }
        clazz
    }

    Map processMethod(Method method, GroovyMethodDoc methodDoc) {
        Map map = [parameters: []]
        Type[] types = method.genericParameterTypes
        methodDoc.parameters().eachWithIndex { GroovyParameter parameter, int index ->
            map.parameters << processParameter(parameter, types[index])
        }

        List paramTokens =  map.parameters.collect {
            String token = "$it.type $it.name"
            if (it.defaultValue) {
                token += " = $it.defaultValue"
            }
            token
        }
        map.text = method.name + '(' + paramTokens.join(', ') + ')'

        DslMethodDoc dslMethod = method.getAnnotation(DslMethodDoc)

        if (method.getAnnotation(Deprecated) || dslMethod?.deprecatedSince()) {
            map.deprecated = true
        }

        if (dslMethod?.deprecatedSince()) {
            map.deprecatedSince = dslMethod.deprecatedSince()
        }

        if (dslMethod?.availableSince()) {
            map.availableSince = dslMethod.availableSince()
        }

        map
    }

    Map processParameter(GroovyParameter parameter, Type type) {
        Map map = [name: parameter.name()]
        Class clazz
        if (type instanceof ParameterizedType) {
            ParameterizedType parameterizedType = (type as ParameterizedType)
            clazz = parameterizedType.rawType as Class
            map.type = getSimpleClassName(clazz) + '<' + parameterizedType.actualTypeArguments.collect { getSimpleClassName it }.join(', ') + '>'
        } else {
            clazz = type as Class
            if (parameter.vararg()) {
                map.type = getSimpleClassName(clazz.componentType) + '...'
            } else {
                map.type = getSimpleClassName(clazz)
            }
        }

        if (parameter.defaultValue()) {
            map.defaultValue = parameter.defaultValue()
        }
        map
    }

    String getSimpleClassName(Class clazz) {
        String name = clazz.name
        List prefixes = [
            'java.lang.',
            'java.util.',
            'groovy.lang.',
        ]
        for (String prefix in prefixes) {
            if (name.startsWith(prefix)) {
                name = name.substring(prefix.length())
                break
            }
        }
        name
    }
}

package javaposse.jobdsl.dsl.doc

import groovy.json.JsonBuilder
import javaposse.jobdsl.dsl.JobParent
import javaposse.jobdsl.dsl.RequiresPlugin
import org.codehaus.groovy.groovydoc.GroovyAnnotationRef
import org.codehaus.groovy.groovydoc.GroovyClassDoc
import org.codehaus.groovy.groovydoc.GroovyMethodDoc
import org.codehaus.groovy.groovydoc.GroovyParameter
import org.codehaus.groovy.tools.groovydoc.ArrayClassDocWrapper
import org.pegdown.Extensions
import org.pegdown.PegDownProcessor

import java.lang.annotation.Annotation
import java.lang.reflect.Field
import java.lang.reflect.Method
import java.lang.reflect.Modifier
import java.lang.reflect.ParameterizedType
import java.lang.reflect.Type

class ApiDocGenerator {

    final private GroovyDocHelper docHelper = new GroovyDocHelper('src/main/groovy/')
    final private String commandDocsPath = 'src/main/docs'
    final private Class rootClass = JobParent
    final private Map allContextClasses = [:]
    final private List allContextClassesList = []

    static void main(String[] args) {
        String version = args[0]
        String outputPath = args[1]

        JsonBuilder builder = new ApiDocGenerator().generateApi(version)

        File file = new File(outputPath)
        file.parentFile.mkdirs()

        file.withWriter { it << builder.toPrettyString() }
    }

    JsonBuilder generateApi(String version) {
        allContextClassesList << rootClass.name
        allContextClasses[rootClass.name] = processClass(rootClass)
        Map map = [
            version: version,
            root: [
                name: 'Jenkins Job DSL API',
                contextClass: rootClass.name,
                html: markdownToHtml(getMarkdownFromFile('/root'))
            ],
            contexts: allContextClasses
        ]

        JsonBuilder builder = new JsonBuilder()
        builder map

        builder
    }

    private String getMarkdownFromFile(String path) {
        File file = new File("${commandDocsPath}${path}.md")
        file.exists() ? file.text : null
    }

    private Map processClass(Class clazz) {
        Map map = [type: clazz.name]

        map.methods = getMethodsForClass(clazz)
        getDelegateClasses(clazz).each { Class delegateClass ->
            map.methods.addAll getMethodsForClass(delegateClass)
        }
        map.methods = map.methods.sort { it.name }
        map
    }

    private List<Class> getDelegateClasses(Class clazz) {
        GroovyClassDoc classDoc = docHelper.getGroovyClassDoc(clazz)
        List delegateNames = classDoc.properties().findAll {
            it.annotations().any { GroovyAnnotationRef a -> a.name == 'Delegate' }
        }*.name()

        Field[] declaredFields = clazz.declaredFields.findAll { delegateNames.contains it.name }
        declaredFields*.type
    }

    private List getMethodsForClass(Class clazz) {
        List<String> methodNames = clazz.methods.findAll {
            !it.name.startsWith('get') &&
                !it.name.startsWith('set') &&
                !it.name.startsWith('is') &&
                !(it.declaringClass in [Object, Script]) &&
                Modifier.isPublic(it.modifiers) &&
                !it.name.contains('$') &&
                !(it.name in ['invokeMethod', 'executeWithXmlActions'])
        }*.name.unique().sort()
        methodNames.collect { processMethodName it, clazz }
    }

    private Map processMethodName(String methodName, Class clazz) {
        Map methodMap = [
            name      : methodName,
            signatures: []
        ]

        GroovyMethodDoc[] methodDocs = docHelper.getAllMethods(clazz).findAll { it.name() == methodName }

        methodDocs.each { GroovyMethodDoc methodDoc ->
            Method method = GroovyDocHelper.getMethodFromGroovyMethodDoc(methodDoc, clazz)
            if (method) {
                Map signature = processMethod(method, methodDoc)
                methodMap.signatures << signature

                Class contextClass = getContextClass(method, methodDoc)
                if (contextClass) {
                    signature.contextClass = contextClass.name
                    if (!allContextClassesList.contains(contextClass.name)) {
                        allContextClassesList << contextClass.name
                        allContextClasses[contextClass.name] = processClass(contextClass)
                    }
                }
            }
        }

        List<RequiresPlugin> annotations = methodDocs.collect { GroovyMethodDoc methodDoc ->
            Method method = GroovyDocHelper.getMethodFromGroovyMethodDoc(methodDoc, clazz)
            method?.getAnnotation(RequiresPlugin)
        }.findAll()

        String dslPlugin = annotations.find { it.id() }?.id() // TODO add min ver
        if (dslPlugin) {
            methodMap.plugin = dslPlugin
        }

        String markdownFromFile = getMarkdownFromFile("/${clazz.name.replaceAll('\\.', '/')}/$methodName")
        if (markdownFromFile) {
            methodMap.html = markdownToHtml(markdownFromFile)
            methodMap.firstSentenceCommentText = markdownFromFile.trim().split('\n', 2)[0]
        } else {
            for (GroovyMethodDoc methodDoc : methodDocs) {
                String comment = methodDoc.commentText().trim()
                if (comment) {
                    int defListIndex = comment.indexOf('<DL>')
                    if (defListIndex != -1) {
                        comment = comment[0..<defListIndex]
                    }
                    if (comment) {
                        methodMap.html = comment
                    }

                    String firstSentenceCommentText = methodDoc.firstSentenceCommentText()
                    int annotationIndex = firstSentenceCommentText.indexOf('@')
                    if (annotationIndex != -1) {
                        firstSentenceCommentText = firstSentenceCommentText[0..<annotationIndex]
                    }
                    if (firstSentenceCommentText) {
                        methodMap.firstSentenceCommentText = firstSentenceCommentText
                    }

                    break
                }
            }
        }

        methodMap
    }

    private String markdownToHtml(String markdown) {
        PegDownProcessor processor = new PegDownProcessor(Extensions.FENCED_CODE_BLOCKS | Extensions.SUPPRESS_ALL_HTML)
        processor.markdownToHtml markdown
    }

    private Class getContextClass(Method method, GroovyMethodDoc methodDoc) {
        Class clazz = null
        GroovyParameter[] groovyParameters = methodDoc.parameters()
        if (groovyParameters.length) {
            Annotation[][] parameterAnnotations = method.parameterAnnotations
            clazz = getContextClass(groovyParameters[-1], parameterAnnotations[-1])
        }
        clazz
    }

    private Class getContextClass(GroovyParameter parameter, Annotation[] annotations) {
        Class clazz = null
        if (parameter.typeName() == 'groovy.lang.Closure') {
            DelegatesTo annotation = annotations.find { it.annotationType() == DelegatesTo } as DelegatesTo
            if (annotation) {
                clazz = annotation.value()
            }
        }
        clazz
    }

    private Map processMethod(Method method, GroovyMethodDoc methodDoc) {
        Map map = [parameters: []]
        Type[] types = method.genericParameterTypes
        methodDoc.parameters().eachWithIndex { GroovyParameter parameter, int index ->
            map.parameters << processParameter(parameter, types[index])
        }

        List paramTokens = map.parameters.collect {
            String token = "$it.type $it.name"
            if (it.defaultValue) {
                token += " = $it.defaultValue"
            }
            token
        }
        map.text = method.name + '(' + paramTokens.join(', ') + ')'

        if (method.getAnnotation(Deprecated)) {  // TODO or comment deprecated
            map.deprecated = true
        }

        String availableSince = methodDoc.tags().find { it.name() == 'since' }?.text()
        if (availableSince) {
            map.availableSince = availableSince
        }

        map
    }

    private Map processParameter(GroovyParameter parameter, Type type) {
        Map map = [name: parameter.name()]
        Class clazz
        if (type instanceof ParameterizedType) {
            ParameterizedType parameterizedType = (type as ParameterizedType)
            clazz = parameterizedType.rawType as Class
            map.type = getSimpleClassName(clazz) + '<' + parameterizedType.actualTypeArguments.collect {
                getSimpleClassName it
            }.join(', ') + '>'
        } else {
            clazz = type as Class
            if (parameter.vararg()) {
                map.type = getSimpleClassName(clazz.componentType) + '...'
            } else if (parameter.type() && parameter.type() instanceof ArrayClassDocWrapper) {
                map.type = getSimpleClassName(clazz.componentType) + '[]'
            } else {
                map.type = getSimpleClassName(clazz)
            }
        }

        if (parameter.defaultValue()) {
            map.defaultValue = parameter.defaultValue()
        }
        map
    }

    private String getSimpleClassName(Class clazz) {
        String name = clazz.name
        List prefixes = [
            'java.lang.',
            'java.util.',
            'groovy.lang.',
        ]
        for (String prefix in prefixes) {
            if (name.startsWith(prefix)) {
                name = name[prefix.length()..-1]
                break
            }
        }
        name
    }
}

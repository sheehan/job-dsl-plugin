package javaposse.jobdsl.dsl.doc

import org.codehaus.groovy.groovydoc.GroovyAnnotationRef
import org.codehaus.groovy.groovydoc.GroovyClassDoc
import org.codehaus.groovy.groovydoc.GroovyMethodDoc
import org.codehaus.groovy.groovydoc.GroovyParameter
import org.codehaus.groovy.groovydoc.GroovyProgramElementDoc
import org.codehaus.groovy.groovydoc.GroovyRootDoc
import org.codehaus.groovy.tools.groovydoc.GroovyDocTool

import java.lang.reflect.Method

class GroovyDocHelper {

    final GroovyRootDoc rootDoc

    GroovyDocHelper(String sourcePath) {
        rootDoc = createRootDoc(sourcePath)
    }

    private static createRootDoc(String sourcePath) {
        List filePaths = []
        File root = new File(sourcePath)
        root.eachFileRecurse { File file ->
            if (file.isFile()) {
                filePaths.add file.canonicalPath - root.canonicalPath
            }
        }
        GroovyDocTool tool = new GroovyDocTool([root] as String[])
        tool.add filePaths

        tool.rootDoc
    }

    GroovyClassDoc getGroovyClassDoc(Class clazz) {
        String name = '/' + clazz.name.replaceAll('\\.', '/')
        rootDoc.classes().find { it.fullPathName == name }
    }

    static boolean hasAnnotation(GroovyProgramElementDoc doc, Class annotationClass) {
        GroovyAnnotationRef[] annotations = doc.annotations()
        annotations.any { it.name() == annotationClass.name.replaceAll('\\.', '/') }
    }

    static Method getMethodFromGroovyMethodDoc(GroovyMethodDoc methodDoc, Class clazz) {
        clazz.methods.findAll { it.name == methodDoc.name() }.find { Method method ->
            List docParamNames = methodDoc.parameters().collect {
                String name = it.type()?.qualifiedTypeName() ?: it.typeName()
                if (name.startsWith('.')) {
                    name = name.substring(1)
                }
                it.vararg() ? "[L$name;" : name
            }
            docParamNames == method.parameterTypes*.name
        }
    }

    static GroovyMethodDoc[] getAllMethods(GroovyClassDoc classDoc) {
        List<GroovyMethodDoc> methodDocs = classDoc.methods()
        GroovyClassDoc superclass = classDoc.superclass()
        if (superclass && superclass != classDoc) {
            methodDocs.addAll getAllMethods(classDoc.superclass())
        }
        methodDocs
    }
}

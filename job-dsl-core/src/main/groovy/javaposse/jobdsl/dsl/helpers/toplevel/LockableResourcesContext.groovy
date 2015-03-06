package javaposse.jobdsl.dsl.helpers.toplevel

import javaposse.jobdsl.dsl.Context
import javaposse.jobdsl.dsl.doc.DslMethodDoc

class LockableResourcesContext implements Context {
    String resourcesVariable
    Integer resourceNumber

    @DslMethodDoc
    void resourcesVariable(String resourcesVariable) {
        this.resourcesVariable = resourcesVariable
    }

    @DslMethodDoc
    void resourceNumber(int resourceNumber) {
        this.resourceNumber = resourceNumber
    }
}

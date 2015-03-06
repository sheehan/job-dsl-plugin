package javaposse.jobdsl.dsl.helpers.toplevel

import javaposse.jobdsl.dsl.Context
import javaposse.jobdsl.dsl.doc.DslMethodDoc

class ThrottleConcurrentBuildsContext implements Context {
    boolean throttleDisabled = false
    List<String> categories = []
    int maxConcurrentPerNode = 0
    int maxConcurrentTotal = 0

    @DslMethodDoc
    void throttleDisabled(boolean throttleDisabled = true) {
        this.throttleDisabled = throttleDisabled
    }

    @DslMethodDoc
    void categories(List<String> categories) {
        this.categories = categories
    }

    @DslMethodDoc
    void maxPerNode(int maxPerNode) {
        this.maxConcurrentPerNode = maxPerNode
    }

    @DslMethodDoc
    void maxTotal(int maxTotal) {
        this.maxConcurrentTotal = maxTotal
    }
}

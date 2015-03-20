package javaposse.jobdsl.dsl.views

import javaposse.jobdsl.dsl.DslContext
import javaposse.jobdsl.dsl.JobManagement
import javaposse.jobdsl.dsl.View
import javaposse.jobdsl.dsl.doc.DslMethodDoc

import static com.google.common.base.Preconditions.checkNotNull
import static java.lang.String.CASE_INSENSITIVE_ORDER
import static javaposse.jobdsl.dsl.ContextHelper.executeInContext

class ListView extends View {
    private final JobsContext jobsContext = new JobsContext()

    ListView(JobManagement jobManagement) {
        super(jobManagement)
    }

    @DslMethodDoc
    void statusFilter(StatusFilter filter) {
        checkNotNull(filter, 'filter must not be null')

        execute {
            if (filter == StatusFilter.ALL) {
                it.children().removeAll { it instanceof Node && it.name() == 'statusFilter' }
            } else {
                it / methodMissing('statusFilter', filter == StatusFilter.ENABLED)
            }
        }
    }

    @DslMethodDoc
    void jobs(@DslContext(JobsContext) Closure jobsClosure) {
        executeInContext(jobsClosure, jobsContext)

        List<String> jobs = jobsContext.jobNames.sort(true, CASE_INSENSITIVE_ORDER) // see GROOVY-6900
        String regex = jobsContext.regex

        execute {
            it / 'jobNames' {
                comparator(class: 'hudson.util.CaseInsensitiveComparator')
                for (String job : jobs) {
                    string(job)
                }
            }
            if (regex) {
                it / includeRegex(regex)
            }
        }
    }

    void columns(@DslContext(ColumnsContext) Closure columnsClosure) {
        ColumnsContext context = new ColumnsContext(jobManagement)
        executeInContext(columnsClosure, context)

        execute {
            for (Node columnNode : context.columnNodes) {
                it / 'columns' << columnNode
            }
        }
    }

    void jobFilters(@DslContext(JobFiltersContext) Closure jobFiltersClosure) {
        JobFiltersContext context = new JobFiltersContext()
        executeInContext(jobFiltersClosure, context)

        execute {
            context.filterNodes.each { filterNode ->
                it / 'jobFilters' << filterNode
            }
        }
    }

    void recurse(boolean shouldRecurse = true) {
        execute {
            it / 'recurse' << shouldRecurse
        }
    }

    static enum StatusFilter {
        ALL, ENABLED, DISABLED
    }
}

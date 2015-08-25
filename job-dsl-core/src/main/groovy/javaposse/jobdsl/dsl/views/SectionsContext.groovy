package javaposse.jobdsl.dsl.views

import javaposse.jobdsl.dsl.AbstractContext
import javaposse.jobdsl.dsl.DslContext
import javaposse.jobdsl.dsl.JobManagement

import static java.lang.String.CASE_INSENSITIVE_ORDER
import static javaposse.jobdsl.dsl.ContextHelper.executeInContext

class SectionsContext extends AbstractContext {
    List<Node> sectionNodes = []

    SectionsContext(JobManagement jobManagement) {
        super(jobManagement)
    }

    /**
     * Adds a list view section.
     */
    void listView(@DslContext(ListViewSectionContext) Closure listViewSectionClosure) {
        ListViewSectionContext context = new ListViewSectionContext(jobManagement)
        executeInContext(listViewSectionClosure, context)

        sectionNodes << new NodeBuilder().'hudson.plugins.sectioned__view.ListViewSection' {
            jobNames {
                comparator(class: 'hudson.util.CaseInsensitiveComparator')
                for (String job : context.jobsContext.jobNames.sort(true, CASE_INSENSITIVE_ORDER)) { // see GROOVY-6900
                    string(job)
                }
            }
            jobFilters(context.jobFiltersContext.filterNodes)
            name(context.name)
            if (context.jobsContext.regex) {
                includeRegex(context.jobsContext.regex)
            }
            width(context.width)
            alignment(context.alignment)
            columns(context.columnsContext.columnNodes)
        }
    }
}

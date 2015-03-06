package javaposse.jobdsl.dsl.doc;

import java.lang.annotation.*;

@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface DslMethodDoc {
    public abstract String plugin() default "";
    public abstract String exampleXml() default "";
}

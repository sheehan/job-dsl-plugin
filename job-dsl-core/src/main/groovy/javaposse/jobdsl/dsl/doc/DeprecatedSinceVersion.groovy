package javaposse.jobdsl.dsl.doc

import java.lang.annotation.ElementType
import java.lang.annotation.Retention
import java.lang.annotation.RetentionPolicy
import java.lang.annotation.Target


@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@interface DeprecatedSinceVersion {

    String value()
}